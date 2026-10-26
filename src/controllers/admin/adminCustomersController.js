const mongoose = require("mongoose");
const User = require("../../models/user");
const Order = require("../../models/Order");

const escapeRegex = require("../../utils/escapeRegex");
const logger = require("../../utils/logger");

const USER_LIST_FIELDS = "username email phone createdAt";

const buildOrderStats = async (userIds) => {
  if (!userIds.length) return new Map();

  const orderStats = await Order.aggregate([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: "$userId",
        totalSpent: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$paymentStatus", "paid"] },
                  { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
                ],
              },
              "$totalAmount",
              0,
            ],
          },
        },
        orderCount: { $sum: 1 },
        lastOrderDate: { $max: "$createdAt" },
      },
    },
  ]);

  return new Map(orderStats.map((stat) => [String(stat._id), stat]));
};

const projectCustomer = (user, orderStatsMap) => {
  const stats = orderStatsMap.get(String(user._id)) || {
    totalSpent: 0,
    orderCount: 0,
    lastOrderDate: null,
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
    lastOrderDate: stats.lastOrderDate || null,
  };
};

const customerSortValue = (customer, sortBy) => {
  switch (sortBy) {
    case "username":
      return customer.name || "";
    case "email":
      return customer.email || "";
    case "orderCount":
      return customer.orderCount ?? 0;
    case "totalSpent":
      return customer.totalSpent ?? 0;
    case "lastOrderDate":
      return customer.lastOrderDate ? new Date(customer.lastOrderDate).getTime() : 0;
    case "createdAt":
    default:
      return customer.registeredDate ? new Date(customer.registeredDate).getTime() : 0;
  }
};

// Sort fields that depend on order aggregates — these can't be resolved by
// Mongo directly on the User collection, so they require loading the full
// matching set. Everything else is paginated by the database.
const AGGREGATE_SORT_FIELDS = new Set([
  "orderCount",
  "totalSpent",
  "lastOrderDate",
]);

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
    const normalizedSortBy = String(sortBy || "createdAt");
    const sortDirection = parseInt(sortOrder, 10) === 1 ? 1 : -1;

    // Build filter - include only standard users
    const filter = {
      role: "user",
    };

    if (search) {
      const safeSearch = escapeRegex(search);
      const regex = new RegExp(safeSearch, "i");
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

    const total = await User.countDocuments(filter);

    const mongoSortField = normalizedSortBy === "username" ? "username" : normalizedSortBy === "email" ? "email" : "createdAt";

    // Fast path: default/user-field sorts paginate in MongoDB, so we only load
    // the page's users (not the entire users collection with password/OTP/etc).
    if (!AGGREGATE_SORT_FIELDS.has(normalizedSortBy)) {
      const users = await User.find(filter)
        .select(USER_LIST_FIELDS)
        .sort({ [mongoSortField]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const orderStatsMap = await buildOrderStats(users.map((u) => u._id));
      const customers = users.map((user) => projectCustomer(user, orderStatsMap));

      return res.status(200).json({
        success: true,
        customers,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(Math.ceil(total / limitNum), 1),
        },
      });
    }

    // Slow path: order-derived sort fields require the whole matching set.
    const users = await User.find(filter).select(USER_LIST_FIELDS).lean();
    const orderStatsMap = await buildOrderStats(users.map((u) => u._id));

    const customers = users.map((user) => projectCustomer(user, orderStatsMap));

    customers.sort((a, b) => {
      const aValue = customerSortValue(a, normalizedSortBy);
      const bValue = customerSortValue(b, normalizedSortBy);

      if (typeof aValue === "string" || typeof bValue === "string") {
        return String(aValue).localeCompare(String(bValue), undefined, {
          sensitivity: "base",
        }) * sortDirection;
      }

      if (aValue === bValue) return 0;
      return (aValue > bValue ? 1 : -1) * sortDirection;
    });

    const paginatedCustomers = customers.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      customers: paginatedCustomers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
    });
  } catch (error) {
    logger.error("❌ Admin Error fetching customers:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

const Address = require("../../models/Address");

/**
 * Admin: Get customer details and their order history
 */
const getCustomerById = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const user = await User.findById(customerId).select(USER_LIST_FIELDS).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Fetch all saved addresses for this customer
    const savedAddresses = await Address.find({ userId: customerId }).lean();

    // Fetch all orders for this customer (projected to the fields the detail
    // view actually renders — items is needed for the per-order item count).
    const orders = await Order.find({ userId: customerId })
      .select("orderId placedAt createdAt orderStatus paymentStatus totalAmount totalQuantity items.quantity")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate stats — only count real spend (paid, not cancelled/returned)
    const totalSpent = orders.reduce((sum, order) => {
      const isPaidValid =
        order.paymentStatus === "paid" &&
        order.orderStatus !== "cancelled" &&
        order.orderStatus !== "returned";
      return isPaidValid ? sum + (order.totalAmount || 0) : sum;
    }, 0);
    const orderCount = orders.length;

    res.status(200).json({
      success: true,
      customer: {
        id: user._id?.toString(),
        _id: user._id?.toString(),
        name: user.username,
        email: user.email,
        phone: user.phone,
        registeredDate: user.createdAt,
        totalSpent,
        orderCount,
      },
      addresses: savedAddresses,
      orders: orders.map(order => ({
        _id: order._id?.toString(),
        orderId: order.orderId || order._id?.toString(),
        date: order.placedAt || order.createdAt,
        status: order.orderStatus, // Using orderStatus instead of status
        paymentStatus: order.paymentStatus,
        total: order.totalAmount,
        itemCount: order.totalQuantity || order.items.reduce((sum, item) => sum + item.quantity, 0),
      })),
    });
  } catch (error) {
    logger.error("❌ Admin Error fetching customer details:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
};


