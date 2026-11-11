const Order = require("../../models/Order");
const {
  NET_REVENUE,
  IS_BOOKED,
  IS_UNPAID_ONLINE,
} = require("../../utils/revenueExpr");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");
const { wantsCsv, sendReportCsv } = require("../../utils/reportCsv");

const CSV_COLUMNS = [
  { field: "status", header: "Status" },
  { field: "count", header: "Orders" },
  { field: "gross", header: "Gross (INR)" },
];

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateOrdersByStatusCache = () =>
  Promise.all([
    cacheDelPattern("report:orders-by-status:*"),
    cacheDelPattern("admin:orders:status-counts:*"),
  ]);

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

const STATUS_ORDER = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

/**
 * @desc    Orders by status / fulfillment report
 * @route   GET /api/v1/admin/reports/orders-by-status
 * @access  Private/Admin
 *
 * Counts orders and gross order value grouped by current order status, plus
 * payment-status and fulfillment (COD-pending) breakdowns for the range.
 */
exports.getOrdersByStatus = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:orders-by-status:v2:custom:${from || "start"}:${to || "end"}`
      : `report:orders-by-status:v2:${period}`;

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
          const start = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
          dateMatch = { createdAt: { $gte: start } };
        }
      }

      const baseMatch = { ...dateMatch };

      const [
        byStatus,
        byPayment,
        totalsAgg,
        codPendingAgg,
        paymentStatusAgg,
      ] = await Promise.all([
        Order.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$orderStatus",
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
              // Booked = real sales (utils/revenueExpr); unpaid online =
              // checkouts whose payment never completed.
              bookedValue: { $sum: { $cond: [IS_BOOKED, NET_REVENUE, 0] } },
              unpaidOnline: { $sum: { $cond: [IS_UNPAID_ONLINE, 1, 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$paymentMethod",
              count: { $sum: 1 },
              total: { $sum: "$totalAmount" },
              paid: {
                $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, NET_REVENUE, 0] },
              },
            },
          },
        ]),
        Order.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              paidCount: {
                $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
              },
              bookedCount: { $sum: { $cond: [IS_BOOKED, 1, 0] } },
              bookedValue: { $sum: { $cond: [IS_BOOKED, NET_REVENUE, 0] } },
              unpaidOnlineCount: { $sum: { $cond: [IS_UNPAID_ONLINE, 1, 0] } },
              unpaidOnlineTotal: {
                $sum: { $cond: [IS_UNPAID_ONLINE, "$totalAmount", 0] },
              },
            },
          },
        ]),
        Order.aggregate([
          {
            $match: {
              ...baseMatch,
              paymentMethod: "COD",
              paymentStatus: { $ne: "paid" },
              orderStatus: { $nin: ["cancelled", "returned"] },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
        Order.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$paymentStatus",
              count: { $sum: 1 },
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
      ]);

      const statusMap = new Map(byStatus.map((r) => [r._id, r]));
      const statusStats = STATUS_ORDER.map((s) => {
        const r = statusMap.get(s) || {};
        return {
          status: s,
          count: r.count || 0,
          gross: Number(r.gross) || 0,
          bookedValue: Number(r.bookedValue) || 0,
          unpaidOnline: r.unpaidOnline || 0,
        };
      });

      const paymentMap = new Map(byPayment.map((r) => [r._id, r]));
      const paymentStats = ["COD", "PHONEPE", "RAZORPAY"].map((m) => {
        const r = paymentMap.get(m) || {};
        return {
          method: m,
          count: r.count || 0,
          total: Number(r.total) || 0,
          paid: Number(r.paid) || 0,
        };
      });

      const paymentStatusMap = new Map(
        paymentStatusAgg.map((r) => [r._id, r]),
      );
      const paymentStatusStats = ["pending", "paid", "failed", "refunded"].map(
        (s) => {
          const r = paymentStatusMap.get(s) || {};
          return {
            status: s,
            count: r.count || 0,
            total: Number(r.total) || 0,
          };
        },
      );

      const totals = totalsAgg[0] || { count: 0, paidCount: 0 };
      const codRow = codPendingAgg[0] || { count: 0, total: 0 };

      return {
        success: true,
        statusStats,
        paymentStats,
        paymentStatusStats,
        codPending: {
          count: codRow.count || 0,
          total: Number(codRow.total) || 0,
        },
        totals: {
          orders: totals.count || 0,
          paidOrders: totals.paidCount || 0,
          bookedOrders: totals.bookedCount || 0,
          bookedValue: Number(totals.bookedValue) || 0,
          unpaidOnline: {
            count: totals.unpaidOnlineCount || 0,
            total: Number(totals.unpaidOnlineTotal) || 0,
          },
        },
      };
    });

    if (wantsCsv(req)) {
      const rows = result.statusStats.map((r) => ({
        ...r,
        status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
      }));
      return sendReportCsv(
        res,
        rows,
        CSV_COLUMNS,
        req.query.filename ||
          `orders-by-status-${from || period}-${new Date().toISOString().slice(0, 10)}`,
      );
    }

    res.status(200).json(result);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Orders by status report error", { message: error.message });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch orders by status report",
    });
  }
};
