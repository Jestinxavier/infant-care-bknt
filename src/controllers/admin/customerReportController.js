const User = require("../../models/user");
const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateCustomerReportCache = () =>
  cacheDelPattern("report:customers:*");

function parseDateRange(from, to) {
  const range = {};
  if (from) {
    const start = new Date(`${from}T00:00:00.000+05:30`);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) range.$lte = end;
  }
  return Object.keys(range).length > 0 ? range : null;
}

/**
 * @desc    Customer report (paginated, filterable, CSV source)
 * @route   GET /api/v1/admin/reports/customers
 * @access  Private/Admin
 *
 * One row per customer. Order stats are scoped to the selected date range,
 * while lifetime spend/orders and first-order date are all-time. This lets
 * the UI show both "in period" activity and full customer value.
 */
exports.getCustomersReport = async (req, res) => {
  try {
    const {
      period = "month",
      from,
      to,
      page = 1,
      limit = 20,
      search = "",
      sortBy = "totalSpent",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

    const SORTABLE = new Set([
      "totalSpent",
      "lifetimeSpent",
      "orderCount",
      "lifetimeOrders",
      "avgOrderValue",
      "lastOrderDate",
      "registeredDate",
      "name",
    ]);
    const sortKey = SORTABLE.has(sortBy) ? sortBy : "totalSpent";
    const order = sortOrder === "asc" ? 1 : -1;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:customers:custom:${from || "start"}:${to || "end"}`
      : `report:customers:${period}`;

    const result = await cacheGetOrSet(cacheKey, TTL.DASHBOARD, async () => {
      const now = new Date();
      const kolkataDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);
      const todayStart = new Date(`${kolkataDateStr}T00:00:00.000+05:30`);

      let dateMatch = {};
      if (customDateRange) {
        dateMatch = { createdAt: customDateRange };
      } else if (period !== "all") {
        const days = { today: 1, yesterday: 1, week: 7, month: 30, year: 365 }[period] ?? 7;
        if (period === "yesterday") {
          const start = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
          dateMatch = { createdAt: { $gte: start, $lt: todayStart } };
        } else if (period === "today") {
          dateMatch = { createdAt: { $gte: todayStart } };
        } else {
          const start = new Date(
            todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
          );
          dateMatch = { createdAt: { $gte: start } };
        }
      }

      // All users with role 'user'
      const users = await User.find({ role: "user" }).lean();
      if (users.length === 0) {
        return buildResponse([], { revenue: 0, orderCount: 0, customers: 0, newCustomers: 0, returningCustomers: 0, repeatRate: 0, avgLtv: 0, avgOrderValue: 0 }, { page: pageNum, limit: limitNum, total: 0, totalPages: 1 });
      }

      const allUserIds = users.map((u) => u._id);

      // 1) Lifetime stats per user (all time)
      const lifetimeAgg = await Order.aggregate([
        { $match: { userId: { $in: allUserIds } } },
        {
          $group: {
            _id: "$userId",
            lifetimeSpent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$paymentStatus", "paid"] },
                      {
                        $and: [
                          { $eq: ["$paymentMethod", "COD"] },
                          { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
                        ],
                      },
                    ],
                  },
                  "$totalAmount",
                  0,
                ],
              },
            },
            lifetimeOrders: { $sum: 1 },
            firstOrderDate: { $min: "$createdAt" },
            lastOrderDate: { $max: "$createdAt" },
          },
        },
      ]);

      // 2) Period stats per user (within date range)
      const periodAgg = await Order.aggregate([
        { $match: { userId: { $in: allUserIds }, ...dateMatch } },
        {
          $group: {
            _id: "$userId",
            periodSpent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ["$paymentStatus", "paid"] },
                      {
                        $and: [
                          { $eq: ["$paymentMethod", "COD"] },
                          { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
                        ],
                      },
                    ],
                  },
                  "$totalAmount",
                  0,
                ],
              },
            },
            periodOrders: { $sum: 1 },
          },
        },
      ]);

      const lifetimeMap = new Map(
        lifetimeAgg.map((r) => [String(r._id), r]),
      );
      const periodMap = new Map(periodAgg.map((r) => [String(r._id), r]));

      let rows = users.map((u) => {
        const lt = lifetimeMap.get(String(u._id)) || {};
        const pt = periodMap.get(String(u._id)) || {};
        const periodOrders = pt.periodOrders || 0;
        const lifetimeOrders = lt.lifetimeOrders || 0;
        const periodSpent = pt.periodSpent || 0;
        const lifetimeSpent = lt.lifetimeSpent || 0;
        return {
          id: String(u._id),
          name: u.username || "",
          email: u.email || "",
          phone: u.phone || "",
          registeredDate: u.createdAt ? u.createdAt.toISOString() : null,
          lifetimeSpent,
          lifetimeOrders,
          firstOrderDate: lt.firstOrderDate ? lt.firstOrderDate.toISOString() : null,
          lastOrderDate: lt.lastOrderDate ? lt.lastOrderDate.toISOString() : null,
          orderCount: periodOrders,
          totalSpent: periodSpent,
          avgOrderValue: periodOrders > 0 ? periodSpent / periodOrders : 0,
          customerType: lifetimeOrders > 1 ? "returning" : lifetimeOrders === 1 ? "new" : "inactive",
        };
      });

      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            r.phone.toLowerCase().includes(q),
        );
      }

      const multiplier = order;
      const sortFn = {
        name: (a, b) => a.name.localeCompare(b.name) * multiplier,
        totalSpent: (a, b) => (a.totalSpent - b.totalSpent) * multiplier,
        lifetimeSpent: (a, b) => (a.lifetimeSpent - b.lifetimeSpent) * multiplier,
        orderCount: (a, b) => (a.orderCount - b.orderCount) * multiplier,
        lifetimeOrders: (a, b) => (a.lifetimeOrders - b.lifetimeOrders) * multiplier,
        avgOrderValue: (a, b) => (a.avgOrderValue - b.avgOrderValue) * multiplier,
        lastOrderDate: (a, b) =>
          (new Date(a.lastOrderDate || 0).getTime() -
            new Date(b.lastOrderDate || 0).getTime()) *
          multiplier,
        registeredDate: (a, b) =>
          (new Date(a.registeredDate || 0).getTime() -
            new Date(b.registeredDate || 0).getTime()) *
          multiplier,
      };
      rows.sort(sortFn[sortKey]);

      const total = rows.length;
      const totalPages = Math.ceil(total / limitNum) || 1;
      const startIdx = (pageNum - 1) * limitNum;
      const paginated = rows.slice(startIdx, startIdx + limitNum);

      // Summary metrics
      const active = rows.filter((r) => r.orderCount > 0);
      const newCustomers = rows.filter((r) => r.customerType === "new").length;
      const returningCustomers = rows.filter((r) => r.customerType === "returning").length;
      const revenue = active.reduce((s, r) => s + r.totalSpent, 0);
      const orderCount = active.reduce((s, r) => s + r.orderCount, 0);
      const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
      const avgLtv = rows.length > 0 ? rows.reduce((s, r) => s + r.lifetimeSpent, 0) / rows.length : 0;
      const repeatRate = rows.length > 0 ? (returningCustomers / rows.length) * 100 : 0;

      const summary = {
        revenue,
        orderCount,
        customers: active.length,
        newCustomers,
        returningCustomers,
        repeatRate,
        avgLtv,
        avgOrderValue,
      };

      return buildResponse(paginated, summary, { page: pageNum, limit: limitNum, total, totalPages });
    });

    res.status(200).json(result);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Customers report error", { message: error.message });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch customers report",
    });
  }
};

function buildResponse(rows, summary, pagination) {
  return { success: true, rows, summary, pagination };
}
