const Order = require("../../models/Order");
const User = require("../../models/user");
const mongoose = require("mongoose");
const emailService = require("../../services/emailService");

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

    // Advanced Search
    if (search) {
      const searchRegex = new RegExp(search, "i");
      // Remove leading '#' for ID searching
      const sanitizedSearch = search.replace(/^#/, "");
      const sanitizedRegex = new RegExp(sanitizedSearch, "i");

      // 1. Find users matching the search term
      const matchingUsers = await User.find({
        $or: [
          { username: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ]
      }).select("_id");

      const matchingUserIds = matchingUsers.map(u => u._id);

      // 2. Build Order Search Queries
      const searchFilters = [
        { orderId: sanitizedRegex }, // Search by Order ID (matches "123" or "#123")
        { userId: { $in: matchingUserIds } }, // Search by Customer (User ID)
        { "shippingAddress.phone": searchRegex }, // Search by Phone in Shipping Address
        { "shippingAddress.fullName": searchRegex } // Search by Name in Shipping Address
      ];

      // Check if valid ObjectId (using sanitized search in case user pasted #ID)
      if (mongoose.Types.ObjectId.isValid(sanitizedSearch)) {
        searchFilters.push({ _id: new mongoose.Types.ObjectId(sanitizedSearch) });
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

    // Check if orderId is a valid ObjectId (MongoDB ID)
    let query = { orderId: orderId };
    const sanitizedId = orderId.replace(/^#/, "");

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      // It could be either, so we search both
      query = {
        $or: [
          { _id: orderId },
          { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } }
        ]
      };
    } else {
      query = { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } };
    }

    const order = await Order.findOne(query)
      .populate({
        path: "items.productId",
        select: "name title images description attributes options"
      })
      .populate("addressId")
      .populate("addressId")
      .populate("userId", "username email phone")
      .populate("deliveryPartner")
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
    const { status, trackingId, deliveryNote } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Check if orderId is a valid ObjectId (MongoDB ID)
    let query = { orderId: orderId };

    const sanitizedId = orderId.replace(/^#/, "");

    // Sanitize and allow case-insensitive search for custom IDs
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      // It could be either, so we search both
      query = {
        $or: [
          { _id: orderId },
          { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } }
        ]
      };
    } else {
      // Just search by custom ID (case insensitive)
      query = { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } };
    }

    const currentOrder = await Order.findOne(query);

    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 2. Prepare Update Fields
    const updateFields = {};

    // Status Update Logic
    if (status) {
      const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      // Validation: If status is changing to 'shipped' or 'delivered', require Partner and Tracking
      if ((status === 'shipped' || status === 'delivered') && status !== currentOrder.orderStatus) {
        // Check incoming update OR existing value on order
        // Handle 'manual' case if frontend sends it, though we prefer ID. 
        // If value is null, it's invalid.
        const partner = req.body.deliveryPartner !== undefined ? req.body.deliveryPartner : currentOrder.deliveryPartner;
        const tracking = trackingId !== undefined ? trackingId : currentOrder.trackingId;

        if (!partner || !tracking) {
          return res.status(400).json({
            success: false,
            message: "Delivery Partner and Tracking ID are required when marking order as Shipped or Delivered."
          });
        }
      }

      updateFields.orderStatus = status;
    }

    // Tracking & Note & Partner Update Logic
    if (trackingId !== undefined) updateFields.trackingId = trackingId;
    if (deliveryNote !== undefined) updateFields.deliveryNote = deliveryNote;

    if (req.body.deliveryPartner !== undefined) {
      // If "manual" string is sent, look for the 'Other / Manual' partner or set null?
      // Ideally frontend sends ID. If it sends "manual" and that's not a valid ID, mongoose will throw CastError later.
      // We'll assume for now frontend logic will be fixed to send valid ObjectId or null.
      // If it's a valid ObjectId or null, assign it.
      if (req.body.deliveryPartner === "manual") {
        // Try to find the seeded "Other / Manual" partner
        const manualPartner = await mongoose.model("DeliveryPartner").findOne({ name: { $regex: /manual/i } });
        if (manualPartner) {
          updateFields.deliveryPartner = manualPartner._id;
        } else {
          return res.status(400).json({ success: false, message: "Manual delivery partner not found in database." });
        }
      } else {
        updateFields.deliveryPartner = req.body.deliveryPartner || null;
      }
    }

    if (req.body.fulfillmentAdditionalInfo !== undefined) updateFields.fulfillmentAdditionalInfo = req.body.fulfillmentAdditionalInfo;

    // Status History Logic
    if (status && status !== currentOrder.orderStatus) {
      const history = currentOrder.statusHistory || [];
      history.push({
        status: status,
        timestamp: new Date(),
        note: `Status updated to ${status}`,
        updatedBy: req.user?._id
      });
      updateFields.statusHistory = history;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update provided",
      });
    }

    // 3. Perform Update using the resolved _id
    const order = await Order.findByIdAndUpdate(
      currentOrder._id,
      { $set: updateFields },
      { new: true }
    )
      .populate("userId", "username email")
      .populate("deliveryPartner")
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

    // Send shipment email if status changed to shipped
    if (status === "shipped" && currentOrder.orderStatus !== "shipped" && order.userId) {
      emailService.sendShipmentEmail(order.userId, order);
    }
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

