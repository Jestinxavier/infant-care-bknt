const User = require("../../models/user");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const {
  cacheGetOrSet,
  cacheDelPattern,
  TTL,
} = require("../../utils/redisCache");

/**
 * Call this whenever an order is placed/updated to flush the dashboard cache.
 */
exports.invalidateDashboardCache = () => cacheDelPattern("dashboard:*");

function parseDateRange(from, to) {
  const range = {};

  if (from) {
    const start = new Date(`${from}T00:00:00.000+05:30`);
    if (!Number.isNaN(start.getTime())) {
      range.$gte = start;
    }
  }

  if (to) {
    const end = new Date(`${to}T23:59:59.999+05:30`);
    if (!Number.isNaN(end.getTime())) {
      range.$lte = end;
    }
  }

  return Object.keys(range).length > 0 ? range : null;
}

/**
 * @desc    Get Admin Dashboard Stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Private/Admin
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Parse and validate period parameter
    const { period = "week", from, to } = req.query;
    const customDateRange = parseDateRange(from, to);
    const cacheKey = customDateRange
      ? `dashboard:custom:${from || "start"}:${to || "end"}`
      : `dashboard:${period}`;

    const cached = await cacheGetOrSet(cacheKey, TTL.DASHBOARD, async () => {
      // Get current date/time in Asia/Kolkata timezone
      const now = new Date();
      const kolkataDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now); // e.g. "2026-06-15"
      const todayStart = new Date(`${kolkataDateStr}T00:00:00.000+05:30`);

      const startDate = new Date();
      let isAllTime = false;
      let isCustomRange = false;
      let daysCount = 7;
      let endDateTime = null;

      if (customDateRange) {
        isCustomRange = true;
        if (customDateRange.$gte) {
          startDate.setTime(customDateRange.$gte.getTime());
        }
        const rangeStart = customDateRange.$gte || startDate;
        const rangeEnd = customDateRange.$lte || now;
        daysCount = Math.max(
          1,
          Math.ceil(
            (rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000),
          ),
        );
      } else {
        switch (period) {
          case "today":
            daysCount = 1;
            startDate.setTime(todayStart.getTime());
            break;
          case "yesterday":
            daysCount = 1;
            startDate.setTime(todayStart.getTime() - 1 * 24 * 60 * 60 * 1000);
            endDateTime = new Date(todayStart.getTime() - 1);
            break;
          case "week":
            daysCount = 7;
            startDate.setTime(todayStart.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
            break;
          case "month":
            daysCount = 30;
            startDate.setTime(todayStart.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
            break;
          case "year":
            daysCount = 365;
            startDate.setTime(todayStart.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
            break;
          case "all":
            isAllTime = true;
            break;
          default:
            daysCount = 7;
            startDate.setTime(todayStart.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
        }
      }

      // Build reusable match stages. Sales analytics should reflect earned revenue,
      // while operational widgets can include non-revenue order states.
      const dateMatch = isAllTime
        ? {}
        : customDateRange
          ? customDateRange
          : endDateTime
            ? { createdAt: { $gte: startDate, $lte: endDateTime } }
            : { createdAt: { $gte: startDate } };
      const baseMatch = { orderStatus: { $ne: "cancelled" }, ...dateMatch };
      const salesMatch = {
        orderStatus: { $nin: ["cancelled", "returned"] },
        paymentStatus: "paid",
        ...dateMatch,
      };

      // 1. Total Revenue - Optimized with single aggregation
      const revenueResult = await Order.aggregate([
        { $match: salesMatch },
        { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
      ]);
      const totalRevenue =
        revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

      // 2. Completed sales count. Keep this aligned with revenue and salesOverTime
      // so Total Orders, AOV, trend percentages, and sparkline data tell one story.
      const newOrders = await Order.countDocuments(salesMatch);

      // 3. Total Customers (All time - represents current user base)
      const totalCustomers = await User.countDocuments({ role: "user" });

      // 4. Products Count (All time - current inventory)
      const productsInStock = await Product.countDocuments({});

      // 5. Compute trend percentages (current vs previous period)
      const calcTrend = (current, previous) => {
        if (!previous || previous === 0) {
          return current > 0 ? { trend: "+100.0%", up: true } : { trend: "0.0%", up: true };
        }
        const diff = ((current - previous) / previous) * 100;
        const up = diff >= 0;
        return { trend: (up ? "+" : "") + diff.toFixed(1) + "%", up };
      };

      let revenueTrendObj = null;
      let ordersTrendObj = null;
      let aovTrendObj = null;

      if (isAllTime) {
        // Split full order history at the temporal midpoint and compare the two halves
        const earliest = await Order.findOne(
          { orderStatus: { $nin: ["cancelled", "returned"] }, paymentStatus: "paid" },
          { createdAt: 1 },
        ).sort({ createdAt: 1 });

        if (earliest) {
          const midpoint = new Date(
            (earliest.createdAt.getTime() + now.getTime()) / 2,
          );

          const [firstHalfRevRes, secondHalfRevRes] = await Promise.all([
            Order.aggregate([
              {
                $match: {
                  orderStatus: { $nin: ["cancelled", "returned"] },
                  paymentStatus: "paid",
                  createdAt: { $lt: midpoint },
                },
              },
              { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
            ]),
            Order.aggregate([
              {
                $match: {
                  orderStatus: { $nin: ["cancelled", "returned"] },
                  paymentStatus: "paid",
                  createdAt: { $gte: midpoint },
                },
              },
              { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
            ]),
          ]);

          const firstRev = firstHalfRevRes[0]?.total || 0;
          const firstOrders = firstHalfRevRes[0]?.count || 0;
          const secondRev = secondHalfRevRes[0]?.total || 0;
          const secondOrders = secondHalfRevRes[0]?.count || 0;

          const firstAov = firstOrders > 0 ? firstRev / firstOrders : 0;
          const secondAov = secondOrders > 0 ? secondRev / secondOrders : 0;

          revenueTrendObj = calcTrend(secondRev, firstRev);
          ordersTrendObj = calcTrend(secondOrders, firstOrders);
          aovTrendObj = calcTrend(secondAov, firstAov);
        }
      } else {
        // Build the previous window (same length as current, immediately before it)
        let prevStartDate = new Date(startDate);
        if (isCustomRange) {
          const rangeStart = customDateRange.$gte || startDate;
          const rangeEnd = customDateRange.$lte || now;
          const diffMs = rangeEnd.getTime() - rangeStart.getTime();
          prevStartDate = new Date(rangeStart.getTime() - diffMs);
        } else {
          prevStartDate.setDate(prevStartDate.getDate() - daysCount);
        }

        const prevDateMatch = { createdAt: { $gte: prevStartDate, $lt: startDate } };

        const [prevRevRes, prevOrdersCount] = await Promise.all([
          Order.aggregate([
            {
              $match: {
                orderStatus: { $nin: ["cancelled", "returned"] },
                paymentStatus: "paid",
                ...prevDateMatch,
              },
            },
            { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
          ]),
          Order.countDocuments({
            orderStatus: { $nin: ["cancelled", "returned"] },
            paymentStatus: "paid",
            ...prevDateMatch,
          }),
        ]);

        const prevTotalRevenue = prevRevRes[0]?.totalRevenue || 0;
        const prevNewOrders = prevOrdersCount;
        const currentAov = newOrders > 0 ? totalRevenue / newOrders : 0;
        const prevAov = prevNewOrders > 0 ? prevTotalRevenue / prevNewOrders : 0;

        revenueTrendObj = calcTrend(totalRevenue, prevTotalRevenue);
        ordersTrendObj = calcTrend(newOrders, prevNewOrders);
        aovTrendObj = calcTrend(currentAov, prevAov);
      }

      // 6. Sales Over Time (including order counts)
      const salesOverTime = await Order.aggregate([
        { $match: salesMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            total: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Format sales data efficiently
      let formattedSales = [];

      if (!isAllTime && (!isCustomRange || daysCount <= 93)) {
        // Pre-create a Map for O(1) lookup
        const salesMap = new Map(
          salesOverTime.map((item) => [item._id, { total: item.total, orders: item.orders }]),
        );

        for (let i = daysCount - 1; i >= 0; i--) {
          const d = new Date(
            (customDateRange?.$lte || endDateTime || now).getTime() - i * 24 * 60 * 60 * 1000,
          );
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(d);

          // Optimize label generation based on period
          let name;
          if (period === "year") {
            // Year range: show month only to avoid 365 crowded labels
            name = d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" });
          } else if (isCustomRange || period === "month") {
            // Custom range and 30-day preset: show "May 5" style dates
            name = d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "Asia/Kolkata",
            });
          } else {
            // Default weekly preset: show weekday short name
            name = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
          }

          const dayData = salesMap.get(dateStr) || { total: 0, orders: 0 };
          formattedSales.push({
            name,
            date: dateStr,
            total: dayData.total,
            orders: dayData.orders,
          });
        }
      } else {
        // For 'all', return raw data to avoid generating too many empty dates
        formattedSales = salesOverTime.map((item) => ({
          name: item._id,
          date: item._id,
          total: item.total,
          orders: item.orders,
        }));
      }

      // 5b. Previous Period Sales (for comparison line)
      let previousPeriodSales = [];
      if (!isAllTime && daysCount > 0) {
        // Previous period: same length, ending the day before current period starts
        const prevPeriodEnd = new Date(startDate.getTime() - 1); // 23:59:59.999 of last prev day
        const prevPeriodStart = new Date(startDate.getTime() - daysCount * 24 * 60 * 60 * 1000); // midnight of first prev day

        const prevPeriodSalesRaw = await Order.aggregate([
          {
            $match: {
              orderStatus: { $nin: ["cancelled", "returned"] },
              paymentStatus: "paid",
              createdAt: { $gte: prevPeriodStart, $lte: prevPeriodEnd },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
              total: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        const prevSalesMap = new Map(
          prevPeriodSalesRaw.map((item) => [item._id, { total: item.total, orders: item.orders }]),
        );

        for (let i = daysCount - 1; i >= 0; i--) {
          const d = new Date(prevPeriodEnd.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(d);

          let name;
          if (period === "year") {
            name = d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" });
          } else if (isCustomRange || period === "month") {
            name = d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "Asia/Kolkata",
            });
          } else {
            name = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
          }

          const dayData = prevSalesMap.get(dateStr) || { total: 0, orders: 0 };
          previousPeriodSales.push({
            name,
            date: dateStr,
            total: dayData.total,
            orders: dayData.orders,
          });
        }
      }

      // Monthly financial summary. This uses paid non-cancelled revenue as
      // gross profit because the current product/order schemas do not store cost.
      const monthlySummary = await Order.aggregate([
        { $match: salesMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
                timezone: "Asia/Kolkata",
              },
            },
            revenue: { $sum: "$totalAmount" },
            grossProfit: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
            items: { $sum: "$totalQuantity" },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            month: "$_id",
            revenue: 1,
            grossProfit: 1,
            orders: 1,
            items: 1,
          },
        },
      ]);

      // 6. Recent Orders - Filter by period
      const recentOrdersRaw = await Order.find(baseMatch)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("userId", "username email");

      const recentOrders = recentOrdersRaw.map((order) => ({
        id: order._id,
        customer: {
          name: order.userId ? order.userId.username : "Guest",
          email: order.userId ? order.userId.email : "N/A",
        },
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
      }));

      // 7. Order Status Distribution
      const orderStatusDistRaw = await Order.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: "$orderStatus",
            count: { $sum: 1 },
          },
        },
      ]);

      const orderStatusDist = orderStatusDistRaw.map((item) => ({
        name: item._id || "Unknown",
        value: item.count,
      }));

      // 8. Fulfillment Rate (% shipped + delivered)
      const totalOrdersForFulfillment = orderStatusDist.reduce((sum, s) => sum + s.value, 0);
      const fulfilledOrders = orderStatusDist
        .filter((s) => ["shipped", "delivered"].includes(s.name))
        .reduce((sum, s) => sum + s.value, 0);
      const fulfillmentRate = totalOrdersForFulfillment > 0
        ? Math.round((fulfilledOrders / totalOrdersForFulfillment) * 100)
        : 0;

      // 9. Revenue per Day
      let effectiveDaysCount = daysCount;
      if (isAllTime) {
        // For all-time, compute actual day span from first order to now
        const earliestOrder = await Order.findOne(
          { orderStatus: { $nin: ["cancelled", "returned"] }, paymentStatus: "paid" },
          { createdAt: 1 },
        ).sort({ createdAt: 1 });
        if (earliestOrder) {
          effectiveDaysCount = Math.max(1, Math.ceil(
            (now.getTime() - earliestOrder.createdAt.getTime()) / (24 * 60 * 60 * 1000),
          ));
        }
      }
      const revenuePerDay = effectiveDaysCount > 0
        ? Math.round(totalRevenue / effectiveDaysCount)
        : totalRevenue;

      // 10. Total Products Sold (sum of totalQuantity across orders)
      const totalProductsSold = monthlySummary.reduce(
        (sum, m) => sum + (m.items || 0),
        0,
      );

      // 9. Sales by Category - Optimized with period filter
      const categorySalesRaw = await Order.aggregate([
        { $match: salesMatch },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            let: { pid: "$items.productId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      {
                        $eq: [
                          "$_id",
                          {
                            $cond: [
                              {
                                $regexMatch: {
                                  input: { $toString: "$$pid" },
                                  regex: /^[0-9a-fA-F]{24}$/,
                                },
                              },
                              { $toObjectId: "$$pid" },
                              "$$pid",
                            ],
                          },
                        ],
                      },
                      { $eq: ["$url_key", "$$pid"] },
                      { $in: ["$$pid", "$variants.id"] },
                    ],
                  },
                },
              },
            ],
            as: "product",
          },
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            categoryIdObj: {
              $cond: {
                if: {
                  $and: [
                    { $gt: ["$product.category", null] },
                    { $ne: ["$product.category", ""] },
                    {
                      $regexMatch: {
                        input: { $toString: "$product.category" },
                        regex: /^[0-9a-fA-F]{24}$/,
                      },
                    },
                  ],
                },
                then: { $toObjectId: "$product.category" },
                else: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "categoryIdObj",
            foreignField: "_id",
            as: "categoryDoc",
          },
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: {
              $ifNull: [
                "$categoryDoc.name",
                { $ifNull: ["$product.categoryName", "Uncategorized"] },
              ],
            },
            value: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            count: { $sum: "$items.quantity" },
          },
        },
        { $sort: { value: -1 } },
      ]);

      const categorySales = categorySalesRaw.map((item) => ({
        name: item._id || "Uncategorized",
        value: item.value,
        count: item.count,
      }));

      // 10. COD Pending - total and over time
      const codPendingMatch = {
        paymentMethod: "COD",
        paymentStatus: "pending",
        ...dateMatch,
      };

      const [codPendingRevRes] = await Order.aggregate([
        { $match: codPendingMatch },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);
      const codPendingRevenue = codPendingRevRes?.total || 0;

      let codPendingTrendObj = null;
      if (!isAllTime) {
        let prevStartDate = new Date(startDate);
        if (isCustomRange) {
          const rangeStart = customDateRange.$gte || startDate;
          const rangeEnd = customDateRange.$lte || now;
          const diffMs = rangeEnd.getTime() - rangeStart.getTime();
          prevStartDate = new Date(rangeStart.getTime() - diffMs);
        } else {
          prevStartDate.setDate(prevStartDate.getDate() - daysCount);
        }

        const [prevCodPendingRevRes] = await Order.aggregate([
          {
            $match: {
              paymentMethod: "COD",
              paymentStatus: "pending",
              createdAt: { $gte: prevStartDate, $lt: startDate },
            },
          },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]);

        codPendingTrendObj = calcTrend(
          codPendingRevenue,
          prevCodPendingRevRes?.total || 0,
        );
      }

      const codPendingOverTimeRaw = await Order.aggregate([
        { $match: codPendingMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            total: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      let codPendingOverTime = [];
      if (!isAllTime && (!isCustomRange || daysCount <= 93)) {
        const codMap = new Map(
          codPendingOverTimeRaw.map((item) => [item._id, { total: item.total, orders: item.orders }]),
        );
        for (let i = daysCount - 1; i >= 0; i--) {
          const d = new Date(
            (customDateRange?.$lte || endDateTime || now).getTime() - i * 24 * 60 * 60 * 1000,
          );
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(d);

          let name;
          if (period === "year") {
            name = d.toLocaleDateString("en-US", { month: "short", timeZone: "Asia/Kolkata" });
          } else if (isCustomRange || period === "month") {
            name = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
          } else {
            name = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Kolkata" });
          }

          const dayData = codMap.get(dateStr) || { total: 0, orders: 0 };
          codPendingOverTime.push({ name, date: dateStr, total: dayData.total, orders: dayData.orders });
        }
      } else {
        codPendingOverTime = codPendingOverTimeRaw.map((item) => ({
          name: item._id,
          date: item._id,
          total: item.total,
          orders: item.orders,
        }));
      }

      return {
        success: true,
        totalRevenue,
        newOrders,
        totalCustomers,
        productsInStock,
        salesOverTime: formattedSales,
        codPendingRevenue,
        codPendingOverTime,
        recentOrders,
        orderStatusDist,
        categorySales,
        monthlySummary,
        fulfillmentRate,
        revenuePerDay,
        totalProductsSold,
        previousPeriodSales,
        trends: {
          revenue: revenueTrendObj,
          orders: ordersTrendObj,
          aov: aovTrendObj,
          codPending: codPendingTrendObj,
        },
      };
    }); // end cacheGetOrSet

    res.status(200).json(cached);
  } catch (error) {
    const logger = require("../../utils/logger");
    logger.error("Dashboard stats error", { message: error.message });
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch dashboard stats",
    });
  }
};
