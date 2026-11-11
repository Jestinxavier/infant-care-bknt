const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");
const { wantsCsv, sendReportCsv } = require("../../utils/reportCsv");
const {
  pickGranularity,
  bucketIdExpr,
  bucketKeys,
} = require("../../utils/reportBuckets");

// Online checkouts whose payment never completed. The payment reconciler
// cancels these, so they used to inflate "Cancellations" and the total the
// rate is divided by. They are reported separately as unpaidOnline.
const UNPAID_ONLINE_MATCH = {
  paymentMethod: { $ne: "COD" },
  paymentStatus: { $in: ["pending", "failed"] },
};
const REAL_ORDER_MATCH = {
  $or: [
    { paymentMethod: "COD" },
    { paymentStatus: { $nin: ["pending", "failed"] } },
  ],
};

const CSV_COLUMNS = [
  { field: "key", header: "Date" },
  { field: "cancelled", header: "Cancelled" },
  { field: "returned", header: "Returned" },
  { field: "total", header: "Total" },
];

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
      ? `report:returns-cancellations:v2:custom:${from || "start"}:${to || "end"}`
      : `report:returns-cancellations:v2:${period}`;

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

      const realMatch = { ...baseMatch, ...REAL_ORDER_MATCH };

      // Trend buckets: hourly for a single day, else daily. With a bounded
      // range every bucket is listed (trendKeys) so quiet periods chart as
      // zero instead of being skipped. All-time stays sparse and daily.
      const rangeStart = dateMatch.createdAt?.$gte;
      const rangeEnd = dateMatch.createdAt?.$lte
        ? dateMatch.createdAt.$lte
        : dateMatch.createdAt?.$lt
          ? new Date(dateMatch.createdAt.$lt.getTime() - 1)
          : now;
      const granularity = rangeStart
        ? pickGranularity(rangeStart, rangeEnd, Infinity)
        : "day";
      const trendKeys = rangeStart ? bucketKeys(rangeStart, rangeEnd, granularity) : null;

      const [byStatus, totalsAgg, trend, unpaidOnlineAgg] = await Promise.all([
        Order.aggregate([
          { $match: { ...realMatch, orderStatus: { $in: ["cancelled", "returned"] } } },
          {
            $group: {
              _id: "$orderStatus",
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
        ]),
        Order.aggregate([
          { $match: realMatch },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
        ]),
        Order.aggregate([
          { $match: { ...realMatch, orderStatus: { $in: ["cancelled", "returned"] } } },
          {
            $group: {
              // IST bucket (see utils/reportBuckets)
              _id: {
                day: bucketIdExpr(granularity),
                status: "$orderStatus",
              },
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
          { $sort: { "_id.day": 1 } },
        ]),
        Order.aggregate([
          { $match: { ...baseMatch, ...UNPAID_ONLINE_MATCH } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              gross: { $sum: "$totalAmount" },
            },
          },
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
        key: r._id.day,
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
        unpaidOnline: {
          count: unpaidOnlineAgg[0]?.count || 0,
          gross: Number(unpaidOnlineAgg[0]?.gross) || 0,
        },
        trend: trendRows,
        granularity,
        trendKeys,
      };
    });

    if (wantsCsv(req)) {
      const byKey = new Map();
      for (const t of result.trend) {
        const entry = byKey.get(t.key) || {
          key: t.key,
          cancelled: 0,
          returned: 0,
        };
        if (t.status === "cancelled") entry.cancelled += t.count;
        else entry.returned += t.count;
        byKey.set(t.key, entry);
      }
      const rows = Array.from(byKey.values())
        .sort((a, b) => (a.key < b.key ? -1 : 1))
        .map((e) => ({ ...e, total: e.cancelled + e.returned }));
      return sendReportCsv(
        res,
        rows,
        CSV_COLUMNS,
        req.query.filename ||
          `returns-cancellations-${from || period}-${new Date().toISOString().slice(0, 10)}`,
      );
    }

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
