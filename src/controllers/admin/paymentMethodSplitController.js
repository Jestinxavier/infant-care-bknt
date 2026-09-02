const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

/**
 * Call whenever an order is placed/updated to flush report caches.
 */
exports.invalidatePaymentMethodSplitCache = () =>
  cacheDelPattern("report:payment-method-split:*");

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

const METHODS = ["COD", "PHONEPE", "RAZORPAY"];

/**
 * @desc    Payment method split report
 * @route   GET /api/v1/admin/reports/payment-method-split
 * @access  Private/Admin
 *
 * Order count, value and successful-payment breakdown by payment method
 * (COD, PhonePe, Razorpay) for the selected range.
 */
exports.getPaymentMethodSplit = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:payment-method-split:custom:${from || "start"}:${to || "end"}`
      : `report:payment-method-split:${period}`;

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

      const [byMethod, totalsAgg] = await Promise.all([
        Order.aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: "$paymentMethod",
              count: { $sum: 1 },
              total: { $sum: "$totalAmount" },
              paidCount: {
                $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
              },
              paidTotal: {
                $sum: {
                  $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$totalAmount", 0],
                },
              },
              codCollectedCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentMethod", "COD"] },
                        { $nin: ["$orderStatus", ["cancelled", "returned"]] },
                      ],
                    },
                    { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 0, 1] },
                    0,
                  ],
                },
              },
              codCollectedTotal: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$paymentMethod", "COD"] },
                        { $nin: ["$orderStatus", ["cancelled", "returned"]] },
                      ],
                    },
                    "$totalAmount",
                    0,
                  ],
                },
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
              total: { $sum: "$totalAmount" },
            },
          },
        ]),
      ]);

      const methodMap = new Map(byMethod.map((r) => [r._id, r]));

      const splits = METHODS.map((m) => {
        const r = methodMap.get(m) || {};
        return {
          method: m,
          count: r.count || 0,
          total: Number(r.total) || 0,
          paidCount: r.paidCount || 0,
          paidTotal: Number(r.paidTotal) || 0,
          codCollectedCount: r.codCollectedCount || 0,
          codCollectedTotal: Number(r.codCollectedTotal) || 0,
        };
      });

      const totals = totalsAgg[0] || { count: 0, total: 0 };
      const total = totals.count || 0;
      const gross = Number(totals.total) || 0;

      // Completion: COD is "collected" when not cancelled/returned (paid OR
      // pending-but-valid); online methods are "successful" when paid.
      const paidOnline = splits
        .filter((s) => s.method !== "COD")
        .reduce((sum, s) => sum + s.paidCount, 0);
      const codCollected = splits.find((s) => s.method === "COD")?.codCollectedCount || 0;
      const collectedOrders = paidOnline + codCollected;
      const collectedTotal =
        splits
          .filter((s) => s.method !== "COD")
          .reduce((sum, s) => sum + s.paidTotal, 0) +
        (splits.find((s) => s.method === "COD")?.codCollectedTotal || 0);

      return {
        success: true,
        splits,
        totals: {
          orders: total,
          gross,
          collectedOrders,
          collectedTotal: Number(collectedTotal) || 0,
          collectionRate: total > 0 ? (collectedOrders / total) * 100 : 0,
        },
      };
    });

    res.status(200).json(result);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Payment method split report error", {
      message: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch payment method split report",
    });
  }
};
