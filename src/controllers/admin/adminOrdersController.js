const Order = require("../../models/Order");
const mongoose = require("mongoose");

/**
 * Admin: Get all orders (not filtered by user)
 * Supports filtering and pagination
 */
const getAllOrders = async (req, res) => {
  try {
    const requestData = req.method === 'POST' ? (req.body || {}) : req.query;
    
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      sortBy = "createdAt",
      sortOrder = -1,
      search,
    } = requestData;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    let filter = {};

    if (status) {
      filter.orderStatus = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    // Search by order ID or user email - guard against invalid ObjectId
    if (search) {
      const searchFilters = [
        { orderId: { $regex: search, $options: "i" } },
      ];

      if (mongoose.Types.ObjectId.isValid(search)) {
        searchFilters.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      filter.$or = searchFilters;
    }

    // Build sort
    const sort = {};
    sort[sortBy] = parseInt(sortOrder, 10);

    // Get total count
    const total = await Order.countDocuments(filter);

    // Fetch orders with full details
    const orders = await Order.find(filter)
      .populate({
        path: "items.variantId",
        populate: { 
          path: "productId", 
          select: "name title images" 
        }
      })
      .populate("addressId", "fullName phone houseName street landmark city state pincode country")
      .populate("userId", "username email phone")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Format orders for admin dashboard
    const formattedOrders = orders.map(order => ({
      _id: order._id?.toString(),
      orderId: order.orderId || order._id?.toString(),
      userId: order.userId?._id?.toString() || order.userId,
      user: order.userId ? {
        username: order.userId.username,
        email: order.userId.email,
        phone: order.userId.phone,
      } : null,
      customerName: order.userId?.username || order.userId?.email || "Guest",
      customerEmail: order.userId?.email,
      customerPhone: order.userId?.phone,
      date: order.placedAt || order.createdAt,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.totalAmount,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      discount: order.discount,
      items: order.items.map(item => ({
        variantId: item.variantId?._id?.toString(),
        productId: item.variantId?.productId?._id?.toString(),
        productName: item.variantId?.productId?.name || item.variantId?.productId?.title,
        productImage: item.variantId?.productId?.images?.[0],
        quantity: item.quantity,
        price: item.price,
      })),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      address: order.addressId,
    }));

    res.status(200).json({
      success: true,
      orders: formattedOrders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
    });
  } catch (err) {
    console.error("❌ Admin Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Admin: Get single order by ID
 */
const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId)
      .populate({
        path: "items.variantId",
        populate: { 
          path: "productId", 
          select: "name title images description" 
        }
      })
      .populate("addressId")
      .populate("userId", "username email phone")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      order: {
        ...order,
        _id: order._id?.toString(),
      },
    });
  } catch (err) {
    console.error("❌ Admin Error fetching order:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Admin: Update order status
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { orderStatus: status },
      { new: true }
    )
      .populate("userId", "username email")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: {
        ...order,
        _id: order._id?.toString(),
      },
    });
  } catch (err) {
    console.error("❌ Admin Error updating order status:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
};

