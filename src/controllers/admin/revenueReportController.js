const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

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

// Sales revenue match — paid orders only (not cancelled/returned).
// Unpaid COD is captured separately as codPending below.
function revenueMatch(dateMatch) {
  return {
    orderStatus: { $nin: ["cancelled", "returned"] },
    paymentStatus: "paid",
    ...dateMatch,
  };
}

/**
 * @desc    Revenue over time report (trend buckets + previous-period comparison)
 * @route   GET /api/v1/admin/reports/revenue-over-time
 * @access  Private/Admin
 *
 * Buckets revenue & orders by day (default) or month across the selected
 * range, plus the same for the preceding period for comparison. Revenue is
 * counted for paid orders only (not cancelled/returned). Unpaid COD that is
 * still collectible is reported separately per bucket as codPending.
 */
exports.getRevenueOverTime = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:revenue-over-time:custom:${from || "start"}:${to || "end"}`
      : `report:revenue-over-time:${period}`;

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

      // Granularity: month for very long ranges, else day
      const rangeDays = Math.max(
        1,
        Math.round((endDate.getTime() - startDate.getTime()) / 86400000),
      );
      const byMonth = rangeDays > 95;

      const dateMatch = { createdAt: { $gte: startDate, $lte: endDate } };

      // Collectible-but-unpaid COD in the selected range (separate from
      // revenue, which now only counts paid orders).
      const codPendingMatch = {
        paymentMethod: "COD",
        paymentStatus: { $ne: "paid" },
        orderStatus: { $nin: ["cancelled", "returned"] },
        ...dateMatch,
      };

      const [current, previous, codPendingAgg] = await Promise.all([
        Order.aggregate([
          { $match: revenueMatch(dateMatch) },
          {
            $group: {
              _id: byMonth
                ? {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                  }
                : {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                    day: { $dayOfMonth: "$createdAt" },
                  },
              total: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        ]),
        Order.aggregate([
          {
            $match: {
              ...revenueMatch({}),
              createdAt: {
                $gte: startDate,
                $lte: endDate,
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
              currentStartMin: { $min: "$createdAt" },
              currentStartMax: { $max: "$createdAt" },
            },
          },
        ]),
        Order.aggregate([
          { $match: codPendingMatch },
          {
            $group: {
              _id: byMonth
                ? {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                  }
                : {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                    day: { $dayOfMonth: "$createdAt" },
                  },
              total: { $sum: "$totalAmount" },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        ]),
      ]);

      const labelFor = (id) => {
        const y = id.year;
        const m = String(id.month).padStart(2, "0");
        const d = String(id.day ?? 1).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      const codPendingByKey = new Map(
        codPendingAgg.map((r) => [labelFor(r._id), r.total || 0]),
      );

      const series = current.map((r) => ({
        key: labelFor(r._id),
        total: Number(r.total) || 0,
        orders: r.orders || 0,
        codPending: Number(codPendingByKey.get(labelFor(r._id))) || 0,
      }));

      // Build previous-period comparison when the range is not custom "today"
      const rangeLenMs = endDate.getTime() - startDate.getTime() + 1;
      const prevStart = new Date(startDate.getTime() - rangeLenMs);

      const previousSeries =
        customDateRange || period !== "today"
          ? await Order.aggregate([
              {
                $match: {
                  ...revenueMatch({}),
                  createdAt: { $gte: prevStart, $lt: startDate },
                },
              },
              {
                $group: {
                  _id: byMonth
                    ? {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                      }
                    : {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" },
                      },
                  total: { $sum: "$totalAmount" },
                  orders: { $sum: 1 },
                },
              },
              { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
            ])
          : [];

      const previousSeriesByKey = new Map(
        previousSeries.map((r) => [labelFor(r._id), r]),
      );

      // Align previous values onto current bucket keys
      const previousPeriod = series.map((s) => ({
        key: s.key,
        total: Number(previousSeriesByKey.get(s.key)?.total) || 0,
        orders: previousSeriesByKey.get(s.key)?.orders || 0,
      }));

      const summary = current.reduce(
        (acc, r) => {
          acc.revenue += Number(r.total) || 0;
          acc.orders += r.orders || 0;
          return acc;
        },
        { revenue: 0, orders: 0 },
      );
      summary.codPending = codPendingAgg.reduce(
        (acc, r) => acc + (Number(r.total) || 0),
        0,
      );

      const prevSummary = previousSeries.reduce(
        (acc, r) => {
          acc.revenue += Number(r.total) || 0;
          acc.orders += r.orders || 0;
          return acc;
        },
        { revenue: 0, orders: 0 },
      );

      return {
        success: true,
        series,
        previousPeriod,
        summary,
        previousPeriodSummary: prevSummary,
        granularity: byMonth ? "month" : "day",
        range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      };
    });

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
