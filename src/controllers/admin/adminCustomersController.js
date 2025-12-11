const mongoose = require("mongoose");
const User = require("../../models/user");
const Order = require("../../models/Order");

/**
 * Admin: Get all customers with pagination and order stats
 */
const getAllCustomers = async (req, res) => {
  try {
    const requestData = req.method === "POST" ? req.body || {} : req.query;
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = "createdAt",
      sortOrder = -1,
    } = requestData;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter - include only standard users
    const filter = {
      role: "user",
    };

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { username: regex },
        { email: regex },
        { phone: regex },
      ];

      // Allow direct search by ObjectId without throwing cast errors
      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.$or.push({ _id: new mongoose.Types.ObjectId(search) });
      }
    }

    // Total users count
    const total = await User.countDocuments(filter);

    // Fetch paginated users
    const users = await User.find(filter)
      .sort({ [sortBy]: parseInt(sortOrder, 10) || -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const userIds = users.map((u) => u._id);

    // Aggregate order stats per user
    const orderStats =
      userIds.length === 0
        ? []
        : await Order.aggregate([
            { $match: { userId: { $in: userIds } } },
            {
              $group: {
                _id: "$userId",
                totalSpent: { $sum: "$totalAmount" },
                orderCount: { $sum: 1 },
              },
            },
          ]);

    const orderStatsMap = new Map(
      orderStats.map((stat) => [String(stat._id), stat])
    );

    const customers = users.map((user) => {
      const stats = orderStatsMap.get(String(user._id)) || {
        totalSpent: 0,
        orderCount: 0,
      };

      return {
        id: user._id?.toString(),
        _id: user._id?.toString(),
        name: user.username,
        email: user.email,
        phone: user.phone,
        registeredDate: user.createdAt,
        totalSpent: stats.totalSpent || 0,
        orderCount: stats.orderCount || 0,
      };
    });

    res.status(200).json({
      success: true,
      customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
    });
  } catch (error) {
    console.error("❌ Admin Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllCustomers,
};


