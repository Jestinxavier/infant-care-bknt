const Order = require("../../models/Order");
const { NET_REVENUE, IS_PAID, bookedMatch } = require("../../utils/revenueExpr");
const {
  DAY_MS,
  pickGranularity,
  bucketIdExpr,
  bucketKeys,
} = require("../../utils/reportBuckets");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");
const { wantsCsv, sendReportCsv } = require("../../utils/reportCsv");

const CSV_COLUMNS = [
  { field: "key", header: "Date" },
  { field: "total", header: "Booked Sales" },
  { field: "collected", header: "Collected" },
  { field: "orders", header: "Orders" },
  { field: "codPending", header: "COD Pending" },
  { field: "prevTotal", header: "Prev Booked Sales" },
  { field: "prevOrders", header: "Prev Orders" },
];

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidateRevenueReportCache = () =>
  cacheDelPattern("report:revenue-over-time:*");

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

const COD_AWAITING = {
  $and: [{ $eq: ["$paymentMethod", "COD"] }, { $ne: ["$paymentStatus", "paid"] }],
};

// Booked sales per bucket (shared definition, utils/revenueExpr), with the
// collected (paid) part and the COD part still awaiting cash.
async function bookedBuckets(start, end, granularity) {
  const rows = await Order.aggregate([
    { $match: bookedMatch({ createdAt: { $gte: start, $lte: end } }) },
    {
      $group: {
        _id: bucketIdExpr(granularity),
        total: { $sum: NET_REVENUE },
        collected: { $sum: { $cond: [IS_PAID, NET_REVENUE, 0] } },
        codPending: { $sum: { $cond: [COD_AWAITING, "$totalAmount", 0] } },
        orders: { $sum: 1 },
      },
    },
  ]);
  const byKey = new Map(rows.map((r) => [r._id, r]));
  return bucketKeys(start, end, granularity).map((key) => {
    const r = byKey.get(key) || {};
    return {
      key,
      total: Number(r.total) || 0,
      collected: Number(r.collected) || 0,
      codPending: Number(r.codPending) || 0,
      orders: r.orders || 0,
    };
  });
}

const sumSeries = (series) =>
  series.reduce(
    (acc, s) => {
      acc.revenue += s.total;
      acc.collected += s.collected;
      acc.codPending += s.codPending;
      acc.orders += s.orders;
      return acc;
    },
    { revenue: 0, collected: 0, codPending: 0, orders: 0 },
  );

/**
 * @desc    Revenue over time report (trend buckets + previous-period comparison)
 * @route   GET /api/v1/admin/reports/revenue-over-time
 * @access  Private/Admin
 *
 * Buckets revenue & orders by day (default) or month across the selected
 * range (IST), plus the preceding period for comparison. Revenue is booked
 * sales (see utils/revenueExpr): paid orders plus COD awaiting collection.
 * Each bucket also carries `collected` (paid) and `codPending` (COD not yet
 * collected, part of the booked total).
 */
exports.getRevenueOverTime = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:revenue-over-time:v2:custom:${from || "start"}:${to || "end"}`
      : `report:revenue-over-time:v2:${period}`;

    const result = await cacheGetOrSet(cacheKey, TTL.DASHBOARD, async () => {
      const now = new Date();
      const kolkataDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);
      const todayStart = new Date(`${kolkataDateStr}T00:00:00.000+05:30`);

      let startDate;
      let endDate;
      if (customDateRange) {
        startDate = customDateRange.$gte || new Date(todayStart);
        endDate = customDateRange.$lte || new Date();
      } else if (period !== "all") {
        const days = { today: 1, yesterday: 1, week: 7, month: 30, year: 365 }[period] ?? 7;
        if (period === "yesterday") {
          startDate = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
          endDate = new Date(todayStart.getTime() - 1);
        } else {
          startDate = new Date(todayStart);
          endDate = new Date();
          if (period !== "today") {
            startDate = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
          }
        }
      } else {
        // all-time: bucket by month using earliest order
        const earliest = await Order.findOne({})
          .sort({ createdAt: 1 })
          .select("createdAt")
          .lean();
        startDate = earliest?.createdAt
          ? new Date(earliest.createdAt)
          : new Date(todayStart);
        endDate = new Date();
      }

      // Hourly for a single IST day, monthly for long ranges, else daily
      const granularity = pickGranularity(startDate, endDate);

      // Booked sales per bucket, plus the preceding period of equal length.
      // The previous series is aligned to the current one by position: its
      // `key` is the matching current bucket (so the chart can pair them) and
      // `prevKey` is its real date. Matching by date string never paired
      // anything, so the comparison line always showed zero.
      const series = await bookedBuckets(startDate, endDate, granularity);

      // Single day: the previous period is the whole previous day (for today
      // the range so far is shorter than a day). Otherwise equal length.
      const rangeLenMs =
        granularity === "hour" ? DAY_MS : endDate.getTime() - startDate.getTime() + 1;
      const prevStart = new Date(startDate.getTime() - rangeLenMs);
      const prevSeries = await bookedBuckets(
        prevStart,
        new Date(startDate.getTime() - 1),
        granularity,
      );

      const previousPeriod = series.map((s, i) => ({
        key: s.key,
        prevKey: prevSeries[i]?.key ?? null,
        total: prevSeries[i]?.total ?? 0,
        orders: prevSeries[i]?.orders ?? 0,
      }));

      const summary = sumSeries(series);
      // Over the aligned buckets only, so today compares with the same hours
      // yesterday rather than with all of yesterday.
      const prevSummary = sumSeries(prevSeries.slice(0, series.length));
      return {
        success: true,
        series,
        previousPeriod,
        summary,
        previousPeriodSummary: prevSummary,
        granularity,
        range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      };
    });

    if (wantsCsv(req)) {
      const rows = result.series.map((s, i) => {
        const prev = result.previousPeriod[i] || {};
        return {
          key: s.key,
          total: s.total,
          collected: s.collected,
          orders: s.orders,
          codPending: s.codPending,
          prevTotal: prev.total || 0,
          prevOrders: prev.orders || 0,
        };
      });
      return sendReportCsv(
        res,
        rows,
        CSV_COLUMNS,
        req.query.filename ||
          `revenue-over-time-${from || period}-${new Date().toISOString().slice(0, 10)}`,
      );
    }

    res.status(200).json(result);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Revenue over time report error", { message: error.message });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch revenue over time report",
    });
  }
};
