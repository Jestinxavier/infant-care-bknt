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
        // 1. Total Revenue (Sum of 'totalAmount' for non-cancelled orders)
        const revenueResult = await Order.aggregate([
            { $match: { orderStatus: { $ne: "cancelled" }, paymentStatus: "paid" } }, // Fixed: status -> orderStatus
            { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // 2. New Orders (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Fixed: status -> orderStatus
        const newOrders = await Order.countDocuments({
            createdAt: { $gte: sevenDaysAgo },
            orderStatus: { $ne: "cancelled" }
        });

        // 3. Total Customers (Role = 'user')
        const totalCustomers = await User.countDocuments({ role: "user" });

        // 4. Products Count (Total number of products)
        const productsInStock = await Product.countDocuments({});

        // 5. Sales Over Time (Last 7 Days)
        const salesOverTime = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    orderStatus: { $ne: "cancelled" } // Fixed: status -> orderStatus
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    total: { $sum: "$totalAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Format sales data
        const formattedSales = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const found = salesOverTime.find(item => item._id === dateStr);
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

            formattedSales.push({
                name: dayName,
                total: found ? found.total : 0
            });
        }

        // 6. Recent Orders (Last 5)
        // Populate user details (Fixed: user -> userId, name -> username)
        const recentOrdersRaw = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("userId", "username email");

        const recentOrders = recentOrdersRaw.map(order => ({
            id: order._id,
            customer: {
                // Check if userId is populated
                name: order.userId ? order.userId.username : "Guest",
                email: order.userId ? order.userId.email : "N/A"
            },
            total: order.totalAmount,
            status: order.orderStatus, // Fixed: status -> orderStatus
            fulfillmentStatus: order.orderStatus
        }));

        // 7. Top Selling Products (Limit 5)
        const topProductsRaw = await Order.aggregate([
            { $match: { orderStatus: { $ne: "cancelled" } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.productId",
                    variantId: { $first: "$items.variantId" }, // Capture variantId for fallback
                    totalSold: { $sum: "$items.quantity" },
                    revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                }
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
                                        { $eq: ["$_id", { $cond: [{ $regexMatch: { input: { $toString: "$$pid" }, regex: /^[0-9a-fA-F]{24}$/ } }, { $toObjectId: "$$pid" }, "$$pid"] }] },
                                        { $eq: ["$url_key", "$$pid"] },
                                        { $in: ["$$pid", "$variants.id"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "productInfo"
                }
            },
            { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
            { $limit: 5 },
            {
                $project: {
                    name: {
                        $ifNull: [
                            "$productInfo.title",
                            { $ifNull: ["$productInfo.name", { $ifNull: ["$variantId", "Unknown Product"] }] }
                        ]
                    },
                    image: { $ifNull: [{ $arrayElemAt: ["$productInfo.images", 0] }, "/placeholder.png"] },
                    totalSold: 1,
                    revenue: 1
                }
            }
        ]);

        // 8. Order Status Distribution
        const orderStatusDistRaw = await Order.aggregate([
            {
                $group: {
                    _id: "$orderStatus",
                    count: { $sum: 1 }
                }
            }
        ]);

        const orderStatusDist = orderStatusDistRaw.map(item => ({
            name: item._id || "Unknown",
            value: item.count
        }));

        // 9. Sales by Category
        const categorySalesRaw = await Order.aggregate([
            { $match: { orderStatus: { $ne: "cancelled" } } },
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
                                        { $eq: ["$_id", { $cond: [{ $regexMatch: { input: { $toString: "$$pid" }, regex: /^[0-9a-fA-F]{24}$/ } }, { $toObjectId: "$$pid" }, "$$pid"] }] },
                                        { $eq: ["$url_key", "$$pid"] },
                                        { $in: ["$$pid", "$variants.id"] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: "product"
                }
            },
            { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    categoryIdObj: {
                        $cond: {
                            if: { $and: [{ $gt: ["$product.category", null] }, { $ne: ["$product.category", ""] }, { $regexMatch: { input: { $toString: "$product.category" }, regex: /^[0-9a-fA-F]{24}$/ } }] },
                            then: { $toObjectId: "$product.category" },
                            else: null
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "categoryIdObj",
                    foreignField: "_id",
                    as: "categoryDoc"
                }
            },
            { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        $ifNull: [
                            "$categoryDoc.name",
                            { $ifNull: ["$product.categoryName", "Uncategorized"] }
                        ]
                    },
                    value: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                    count: { $sum: "$items.quantity" }
                }
            },
            { $sort: { value: -1 } }
        ]);

        const categorySales = categorySalesRaw.map(item => ({
            name: item._id || "Uncategorized",
            value: item.value,
            count: item.count
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
            categorySales
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
