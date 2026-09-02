const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateOrdersByStatusCache = () =>
  cacheDelPattern("report:orders-by-status:*");

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
      ? `report:orders-by-status:custom:${from || "start"}:${to || "end"}`
      : `report:orders-by-status:${period}`;

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
                $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0] },
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
        },
      };
    });

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
