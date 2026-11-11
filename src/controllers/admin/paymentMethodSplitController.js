const Order = require("../../models/Order");
const { NET_REVENUE, IS_BOOKED, IS_PAID } = require("../../utils/revenueExpr");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");
const { wantsCsv, sendReportCsv } = require("../../utils/reportCsv");

const CSV_COLUMNS = [
  { field: "method", header: "Method" },
  { field: "count", header: "Orders" },
  { field: "total", header: "Total (INR)" },
  { field: "paidCount", header: "Paid Orders" },
  { field: "paidTotal", header: "Paid (INR)" },
  { field: "bookedCount", header: "Booked Orders" },
  { field: "bookedValue", header: "Booked (INR)" },
];

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

const METHODS = ["COD", "PHONEPE", "RAZORPAY", "CASH", "UPI", "CARD"];

/**
 * @desc    Payment method split report
 * @route   GET /api/v1/admin/reports/payment-method-split
 * @access  Private/Admin
 *
 * Order count, value and successful-payment breakdown by payment method
 * (COD, PhonePe, Razorpay, and in-store Cash/UPI/Card) for the selected range.
 */
exports.getPaymentMethodSplit = async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;

    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `report:payment-method-split:v2:custom:${from || "start"}:${to || "end"}`
      : `report:payment-method-split:v2:${period}`;

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

      // Per method: every order placed (count/total), the booked part (real
      // sales, utils/revenueExpr) and the collected part (booked AND paid).
      // Grouped case-insensitively: the PhonePe failure path writes "phonepe",
      // which used to drop those orders from the per-method rows.
      const byMethod = await Order.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ["$paymentMethod", "UNKNOWN"] } },
            count: { $sum: 1 },
            total: { $sum: "$totalAmount" },
            paidCount: { $sum: { $cond: [IS_PAID, 1, 0] } },
            paidTotal: { $sum: { $cond: [IS_PAID, NET_REVENUE, 0] } },
            bookedCount: { $sum: { $cond: [IS_BOOKED, 1, 0] } },
            bookedValue: { $sum: { $cond: [IS_BOOKED, NET_REVENUE, 0] } },
            collectedCount: {
              $sum: { $cond: [{ $and: [IS_BOOKED, IS_PAID] }, 1, 0] },
            },
            collectedTotal: {
              $sum: { $cond: [{ $and: [IS_BOOKED, IS_PAID] }, NET_REVENUE, 0] },
            },
          },
        },
      ]);

      const methodMap = new Map(byMethod.map((r) => [r._id, r]));
      const toSplit = (m, r = {}) => ({
        method: m,
        count: r.count || 0,
        total: Number(r.total) || 0,
        paidCount: r.paidCount || 0,
        paidTotal: Number(r.paidTotal) || 0,
        bookedCount: r.bookedCount || 0,
        bookedValue: Number(r.bookedValue) || 0,
        collectedCount: r.collectedCount || 0,
        collectedTotal: Number(r.collectedTotal) || 0,
      });
      const splits = METHODS.map((m) => toSplit(m, methodMap.get(m)));
      // Anything outside the known list still counts toward the totals.
      for (const [m, r] of methodMap) {
        if (!METHODS.includes(m)) splits.push(toSplit(m, r));
      }

      const sum = (field) => splits.reduce((acc, s) => acc + s[field], 0);
      const bookedValue = sum("bookedValue");
      const collectedTotal = sum("collectedTotal");

      return {
        success: true,
        splits,
        totals: {
          orders: sum("count"),
          gross: sum("total"),
          bookedOrders: sum("bookedCount"),
          bookedValue,
          collectedOrders: sum("collectedCount"),
          collectedTotal,
          // Share of booked sales already paid. (It used to count every
          // non-cancelled COD order as "collected", cash or not, and divide
          // by all orders including abandoned checkouts.)
          collectionRate: bookedValue > 0 ? (collectedTotal / bookedValue) * 100 : 0,
        },
      };
    });

    if (wantsCsv(req)) {
      return sendReportCsv(
        res,
        result.splits,
        CSV_COLUMNS,
        req.query.filename ||
          `payment-method-split-${from || period}-${new Date().toISOString().slice(0, 10)}`,
      );
    }

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
