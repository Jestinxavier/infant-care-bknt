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
 * while lifetime spend/orders and first-order date are all-time. Spend only
 * counts paid, non-cancelled/non-returned orders. New/Returning are
 * classified from order activity within the selected period.
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
    // limit=0 requests the complete filtered/sorted dataset (report CSV export)
    const exportAll = String(limit).trim() === "0";
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

    // Paid-only revenue (excludes unpaid COD, cancelled, returned)
    const PAID_VALID_COND = {
      $and: [
        { $eq: ["$paymentStatus", "paid"] },
        { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
      ],
    };

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
    // Cache key covers the period/range AND the search + sort params because the
    // cached payload is the complete filtered/sorted dataset (page-independent).
    const cacheKey = [
      customDateRange
        ? `report:customers:custom:${from || "start"}:${to || "end"}`
        : `report:customers:${period}`,
      `q:${String(search || "").toLowerCase()}`,
      `s:${sortKey}:${order}`,
    ].join(":");

    const cached = await cacheGetOrSet(cacheKey, TTL.DASHBOARD, async () => {
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
        return {
          rows: [],
          total: 0,
          summary: {
            revenue: 0,
            orderCount: 0,
            customers: 0,
            newCustomers: 0,
            returningCustomers: 0,
            repeatRate: 0,
            avgLtv: 0,
            avgOrderValue: 0,
          },
        };
      }

      const allUserIds = users.map((u) => u._id);

      // 1) Lifetime stats per user (all time)
      const lifetimeAgg = await Order.aggregate([
        { $match: { userId: { $in: allUserIds } } },
        {
          $group: {
            _id: "$userId",
            lifetimeSpent: {
              $sum: { $cond: [PAID_VALID_COND, "$totalAmount", 0] },
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
              $sum: { $cond: [PAID_VALID_COND, "$totalAmount", 0] },
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
          customerType:
            periodOrders === 0
              ? "inactive"
              : lifetimeOrders === periodOrders
                ? "new"
                : "returning",
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

      // Summary metrics (computed over the full filtered dataset, page-independent)
      const active = rows.filter((r) => r.orderCount > 0);
      const newCustomers = rows.filter((r) => r.customerType === "new").length;
      const returningCustomers = rows.filter((r) => r.customerType === "returning").length;
      const revenue = active.reduce((s, r) => s + r.totalSpent, 0);
      const orderCount = active.reduce((s, r) => s + r.orderCount, 0);
      const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;
      const avgLtv = rows.length > 0 ? rows.reduce((s, r) => s + r.lifetimeSpent, 0) / rows.length : 0;
      const repeatRate = active.length > 0 ? (returningCustomers / active.length) * 100 : 0;

      return {
        rows,
        total,
        summary: {
          revenue,
          orderCount,
          customers: active.length,
          newCustomers,
          returningCustomers,
          repeatRate,
          avgLtv,
          avgOrderValue,
        },
      };
    });

    // Slice the full filtered/sorted dataset for the requested page AFTER the
    // cache read, so page 2 / export (limit=0) never hit a stale cached page-1 payload.
    const totalPages = exportAll ? 1 : Math.ceil(cached.total / limitNum) || 1;
    const startIdx = (pageNum - 1) * limitNum;
    const paginatedRows = exportAll
      ? cached.rows
      : cached.rows.slice(startIdx, startIdx + limitNum);

    res.status(200).json(
      buildResponse(paginatedRows, cached.summary, {
        page: pageNum,
        limit: exportAll ? 0 : limitNum,
        total: cached.total,
        totalPages,
      })
    );
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
