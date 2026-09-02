const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateReturnsCancellationsCache = () =>
  cacheDelPattern("report:returns-cancellations:*");

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
 * @desc    Returns & cancellations report
 * @route   GET /api/v1/admin/reports/returns-cancellations
 * @access  Private/Admin
 *
 * Counts and values of returned and cancelled orders in range, the resulting
 * rate vs total orders, plus a bucketed trend so the team can spot spikes.
 */
exports.getReturnsCancellations = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:returns-cancellations:custom:${from || "start"}:${to || "end"}`
      : `report:returns-cancellations:${period}`;

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

      const [byStatus, totalsAgg, trend] = await Promise.all([
        Order.aggregate([
          { $match: { ...baseMatch, orderStatus: { $in: ["cancelled", "returned"] } } },
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
              _id: null,
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
        ]),
        Order.aggregate([
          { $match: { ...baseMatch, orderStatus: { $in: ["cancelled", "returned"] } } },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
                day: { $dayOfMonth: "$createdAt" },
                status: "$orderStatus",
              },
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        ]),
      ]);

      const statusMap = new Map(byStatus.map((r) => [r._id, r]));
      const cancelled = statusMap.get("cancelled") || {};
      const returned = statusMap.get("returned") || {};
      const totals = totalsAgg[0] || { count: 0, gross: 0 };

      const cancelledCount = cancelled.count || 0;
      const returnedCount = returned.count || 0;
      const affectedCount = cancelledCount + returnedCount;
      const totalCount = totals.count || 0;

      const trendRows = trend.map((r) => ({
        key: `${r._id.year}-${String(r._id.month).padStart(2, "0")}-${String(
          r._id.day,
        ).padStart(2, "0")}`,
        status: r._id.status,
        count: r.count || 0,
        gross: Number(r.gross) || 0,
      }));

      return {
        success: true,
        cancelled: {
          count: cancelledCount,
          gross: Number(cancelled.gross) || 0,
        },
        returned: {
          count: returnedCount,
          gross: Number(returned.gross) || 0,
        },
        totals: {
          orders: totalCount,
          affectedOrders: affectedCount,
          rate: totalCount > 0 ? (affectedCount / totalCount) * 100 : 0,
          gross: Number(totals.gross) || 0,
        },
        trend: trendRows,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Returns & cancellations report error", {
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch returns & cancellations report",
    });
  }
};
