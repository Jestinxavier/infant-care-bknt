const User = require("../../models/user");
const Product = require("../../models/Product");
const Order = require("../../models/Order");

/**
 * @desc    Get Admin Dashboard Stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Private/Admin
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Parse and validate period parameter
    const { period = "week" } = req.query;

    // Calculate date range based on period
    const now = new Date();
    const startDate = new Date();
    let isAllTime = false;
    let daysCount = 7;

    switch (period) {
      case "week":
        startDate.setDate(now.getDate() - 7);
        daysCount = 7;
        break;
      case "month":
        startDate.setDate(now.getDate() - 30);
        daysCount = 30;
        break;
      case "year":
        startDate.setDate(now.getDate() - 365);
        daysCount = 365;
        break;
      case "all":
        isAllTime = true;
        break;
      default:
        startDate.setDate(now.getDate() - 7);
        daysCount = 7;
    }

    // Build reusable match stage
    const dateMatch = isAllTime ? {} : { createdAt: { $gte: startDate } };
    const baseMatch = { orderStatus: { $ne: "cancelled" }, ...dateMatch };

    // 1. Total Revenue - Optimized with single aggregation
    const revenueResult = await Order.aggregate([
      { $match: { ...baseMatch, paymentStatus: "paid" } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
    ]);
    const totalRevenue =
      revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // 2. New Orders Count
    const newOrders = await Order.countDocuments(baseMatch);

    // 3. Total Customers (All time - represents current user base)
    const totalCustomers = await User.countDocuments({ role: "user" });

    // 4. Products Count (All time - current inventory)
    const productsInStock = await Product.countDocuments({});

    // 5. Sales Over Time
    const salesOverTime = await Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: "$totalAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format sales data efficiently
    let formattedSales = [];

    if (!isAllTime) {
      // Pre-create a Map for O(1) lookup
      const salesMap = new Map(
        salesOverTime.map((item) => [item._id, item.total])
      );

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];

        // Optimize label generation based on period
        let name;
        if (period === "year") {
          name = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        } else if (period === "month") {
          name = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        } else {
          name = d.toLocaleDateString("en-US", { weekday: "short" });
        }

        formattedSales.push({
          name,
          date: dateStr,
          total: salesMap.get(dateStr) || 0,
        });
      }
    } else {
      // For 'all', return raw data to avoid generating too many empty dates
      formattedSales = salesOverTime.map((item) => ({
        name: item._id,
        date: item._id,
        total: item.total,
      }));
    }

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
      total: order.totalAmount,
      status: order.orderStatus,
      fulfillmentStatus: order.orderStatus,
    }));

    // 7. Top Selling Products - Optimized aggregation with period filter
    const topProductsRaw = await Order.aggregate([
      { $match: baseMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          variantId: { $first: "$items.variantId" },
          totalSold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $match: { _id: { $ne: null } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          let: { pid: "$_id" },
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
          as: "productInfo",
        },
      },
      { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
      { $limit: 5 },
      {
        $project: {
          name: {
            $ifNull: [
              "$productInfo.title",
              {
                $ifNull: [
                  "$productInfo.name",
                  { $ifNull: ["$variantId", "Unknown Product"] },
                ],
              },
            ],
          },
          image: {
            $ifNull: [
              { $arrayElemAt: ["$productInfo.images", 0] },
              "/placeholder.png",
            ],
          },
          totalSold: 1,
          revenue: 1,
        },
      },
    ]);

    // 8. Order Status Distribution - Include all statuses (including cancelled) for proper metrics
    const orderStatusDistRaw = await Order.aggregate([
      { $match: dateMatch }, // Apply date filter but include cancelled orders
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

    // 9. Sales by Category - Optimized with period filter
    const categorySalesRaw = await Order.aggregate([
      { $match: baseMatch },
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

    res.status(200).json({
      success: true,
      totalRevenue,
      newOrders,
      totalCustomers,
      productsInStock,
      salesOverTime: formattedSales,
      recentOrders,
      topProducts: topProductsRaw,
      orderStatusDist,
      categorySales,
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch dashboard stats",
      error: error.message,
    });
  }
};
