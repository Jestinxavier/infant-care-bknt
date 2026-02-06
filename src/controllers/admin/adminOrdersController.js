const Order = require("../../models/Order");
const User = require("../../models/user");
const mongoose = require("mongoose");
const emailService = require("../../services/emailService");
const { ORDER_DATE_RESTRICTION_DAYS } = require("../../config/constants");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const { restoreOrderStock } = require("../../utils/orderStockRestore");

/**
 * Admin: Get all orders (not filtered by user)
 * Supports filtering and pagination
 */
const getAllOrders = async (req, res) => {
  try {
    const requestData = req.method === "POST" ? req.body || {} : req.query;

    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      sortBy = "createdAt",
      sortOrder = -1,
      search,
      from, // ISO date string (YYYY-MM-DD)
      to, // ISO date string (YYYY-MM-DD)
    } = requestData;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    let filter = {};

    // ===== ROLE-BASED DATE RESTRICTIONS =====
    const userRole = req.user?.role; // from auth middleware
    const now = new Date();
    const restrictionDaysAgo = new Date(now);
    restrictionDaysAgo.setUTCDate(
      now.getUTCDate() - ORDER_DATE_RESTRICTION_DAYS
    );
    restrictionDaysAgo.setUTCHours(0, 0, 0, 0); // Start of day in UTC

    // For admin: enforce date restriction
    if (userRole === "admin") {
      filter.createdAt = { $gte: restrictionDaysAgo };

      // If custom date range provided, validate it doesn't exceed limit
      if (from) {
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0);

        if (fromDate < restrictionDaysAgo) {
          return res.status(403).json({
            success: false,
            errorCode: "DATE_RESTRICTED",
            message: `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
            maxDate: restrictionDaysAgo.toISOString().split("T")[0],
          });
        }
      }
    }

    // ===== DATE RANGE FILTERING =====
    // Backend normalization: from (00:00:00.000Z) to (23:59:59.999Z)
    if (from || to) {
      filter.createdAt = filter.createdAt || {};

      if (from) {
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0); // Start of day
        filter.createdAt.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999); // End of day
        filter.createdAt.$lte = toDate;
      }
    }

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
          { phone: searchRegex },
        ],
      }).select("_id");

      const matchingUserIds = matchingUsers.map((u) => u._id);

      // 2. Build Order Search Queries
      const searchFilters = [
        { orderId: sanitizedRegex }, // Search by Order ID (matches "123" or "#123")
        { userId: { $in: matchingUserIds } }, // Search by Customer (User ID)
        { "shippingAddress.phone": searchRegex }, // Search by Phone in Shipping Address
        { "shippingAddress.fullName": searchRegex }, // Search by Name in Shipping Address
      ];

      // Check if valid ObjectId (using sanitized search in case user pasted #ID)
      if (mongoose.Types.ObjectId.isValid(sanitizedSearch)) {
        searchFilters.push({
          _id: new mongoose.Types.ObjectId(sanitizedSearch),
        });
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
          select: "name title images",
        },
      })
      .populate("userId", "username email phone")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Format orders for admin dashboard
    const formattedOrders = orders.map((order) => ({
      _id: order._id?.toString(),
      orderId: order.orderId || order._id?.toString(),
      userId: order.userId?._id?.toString() || order.userId,
      user: order.userId
        ? {
            username: order.userId.username,
            email: order.userId.email,
            phone: order.userId.phone,
          }
        : null,
      customerName: order.userId?.username || order.userId?.email || "Guest",
      customerEmail: order.userId?.email,
      customerPhone: order.userId?.phone,
      date: order.placedAt || order.createdAt,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      phonepeTransactionId: order.phonepeTransactionId,
      total: order.totalAmount,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      discount: order.discount,
      items: order.items.map((item) => ({
        variantId: item.variantId,
        productId: item.productId,
        productName: item.name || item.variantId?.productId?.name,
        productImage: item.image || item.variantId?.productId?.images?.[0],
        quantity: item.quantity,
        price: item.price,
      })),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      address: order.shippingAddress,
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
          { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } },
        ],
      };
    } else {
      query = { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } };
    }

    const order = await Order.findOne(query)
      .populate({
        path: "items.productId",
        select: "name title images description attributes options",
      })
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
    const { orderId, status, trackingId, deliveryNote } = req.body;

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
          { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } },
        ],
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
      const validStatuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(
            ", "
          )}`,
        });
      }

      // Validation: If status is changing to 'shipped' or 'delivered', require Partner and Tracking
      if (
        (status === "shipped" || status === "delivered") &&
        status !== currentOrder.orderStatus
      ) {
        // Check incoming update OR existing value on order
        // Handle 'manual' case if frontend sends it, though we prefer ID.
        // If value is null, it's invalid.
        const partner =
          req.body.deliveryPartner !== undefined
            ? req.body.deliveryPartner
            : currentOrder.deliveryPartner;
        const tracking =
          trackingId !== undefined ? trackingId : currentOrder.trackingId;

        if (!partner || !tracking) {
          return res.status(400).json({
            success: false,
            message:
              "Delivery Partner and Tracking ID are required when marking order as Shipped or Delivered.",
          });
        }
      }

      updateFields.orderStatus = status;

      // COD: Auto-complete payment when status switches to delivered
      if (
        status === "delivered" &&
        currentOrder.paymentMethod === PAYMENT_METHODS.COD &&
        currentOrder.paymentStatus === "pending"
      ) {
        updateFields.paymentStatus = "paid";
      }
    }

    // Tracking & Note & Partner Update Logic
    if (trackingId !== undefined) updateFields.trackingId = trackingId;
    if (deliveryNote !== undefined) updateFields.deliveryNote = deliveryNote;

    if (req.body.deliveryPartner !== undefined) {
      const partnerValue = req.body.deliveryPartner;
      let trackingUrlFromPartner = null;

      // Handle object format: { name: "DTDC", trackingUrl: "https://..." }
      if (
        partnerValue &&
        typeof partnerValue === "object" &&
        !Array.isArray(partnerValue)
      ) {
        const partnerName = partnerValue.name;
        trackingUrlFromPartner = partnerValue.trackingUrl;

        // Handle null/empty name
        if (!partnerName) {
          updateFields.deliveryPartner = null;
        }
        // Handle "manual" special case
        else if (partnerName === "manual") {
          const manualPartner = await mongoose
            .model("DeliveryPartner")
            .findOne({ name: { $regex: /manual/i } });
          if (manualPartner) {
            updateFields.deliveryPartner = manualPartner._id;
          } else {
            return res.status(400).json({
              success: false,
              message: "Manual delivery partner not found in database.",
            });
          }
        }
        // If it's a valid ObjectId, use it directly
        else if (mongoose.Types.ObjectId.isValid(partnerName)) {
          updateFields.deliveryPartner = partnerName;
        }
        // Otherwise, treat it as a partner name and look it up
        else {
          const foundPartner = await mongoose
            .model("DeliveryPartner")
            .findOne({ name: { $regex: new RegExp(`^${partnerName}$`, "i") } });

          if (foundPartner) {
            updateFields.deliveryPartner = foundPartner._id;
          } else {
            return res.status(400).json({
              success: false,
              message: `Delivery partner "${partnerName}" not found in database.`,
            });
          }
        }

        // If trackingUrl is provided in the object, add/update it in fulfillmentAdditionalInfo
        if (trackingUrlFromPartner) {
          const currentInfo =
            req.body.fulfillmentAdditionalInfo ||
            currentOrder.fulfillmentAdditionalInfo ||
            [];
          // Check if "Tracking URL" already exists
          const existingUrlIndex = currentInfo.findIndex(
            (item) => item.key && item.key.toLowerCase() === "tracking url"
          );

          if (existingUrlIndex >= 0) {
            // Update existing
            currentInfo[existingUrlIndex].value = trackingUrlFromPartner;
          } else {
            // Add new
            currentInfo.push({
              key: "Tracking URL",
              value: trackingUrlFromPartner,
            });
          }
          updateFields.fulfillmentAdditionalInfo = currentInfo;
        }
      }
      // Legacy string/ObjectId format handling
      else {
        // Handle null/empty case
        if (!partnerValue || partnerValue === null) {
          updateFields.deliveryPartner = null;
        }
        // Handle "manual" special case
        else if (partnerValue === "manual") {
          const manualPartner = await mongoose
            .model("DeliveryPartner")
            .findOne({ name: { $regex: /manual/i } });
          if (manualPartner) {
            updateFields.deliveryPartner = manualPartner._id;
          } else {
            return res.status(400).json({
              success: false,
              message: "Manual delivery partner not found in database.",
            });
          }
        }
        // If it's a valid ObjectId, use it directly
        else if (mongoose.Types.ObjectId.isValid(partnerValue)) {
          updateFields.deliveryPartner = partnerValue;
        }
        // Otherwise, treat it as a partner name and look it up
        else {
          const foundPartner = await mongoose.model("DeliveryPartner").findOne({
            name: { $regex: new RegExp(`^${partnerValue}$`, "i") },
          });

          if (foundPartner) {
            updateFields.deliveryPartner = foundPartner._id;
          } else {
            return res.status(400).json({
              success: false,
              message: `Delivery partner "${partnerValue}" not found in database.`,
            });
          }
        }
      }
    }

    // Handle fulfillmentAdditionalInfo if not already set by deliveryPartner object handling
    if (
      req.body.fulfillmentAdditionalInfo !== undefined &&
      !updateFields.fulfillmentAdditionalInfo
    )
      updateFields.fulfillmentAdditionalInfo =
        req.body.fulfillmentAdditionalInfo;

    // Status History Logic
    if (status && status !== currentOrder.orderStatus) {
      const history = currentOrder.statusHistory || [];
      history.push({
        status: status,
        timestamp: new Date(),
        note: `Status updated to ${status}`,
        updatedBy: req.user?._id,
      });
      updateFields.statusHistory = history;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update provided",
      });
    }

    // Restore product stock when cancelling order (simple, variant, bundle, gift)
    if (
      status === "cancelled" &&
      currentOrder.orderStatus !== "cancelled" &&
      currentOrder.items?.length > 0
    ) {
      try {
        await restoreOrderStock(currentOrder);
      } catch (restoreErr) {
        console.error(
          "❌ Failed to restore stock on order cancel:",
          restoreErr
        );
        return res.status(500).json({
          success: false,
          message:
            "Order status could not be updated. Stock restore failed. Please try again.",
          error: restoreErr.message,
        });
      }
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
    if (
      status === "shipped" &&
      currentOrder.orderStatus !== "shipped" &&
      order.userId
    ) {
      emailService.sendShipmentEmail(order.userId, order);
    }

    // Send order cancelled email if status changed to cancelled
    if (
      status === "cancelled" &&
      currentOrder.orderStatus !== "cancelled" &&
      order.userId?.email
    ) {
      emailService
        .sendOrderCancelledEmail(order.userId, order)
        .catch((err) =>
          console.error("❌ Order cancelled email failed:", err.message)
        );
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

/**
 * Admin: Send invoice email
 */
const sendOrderInvoice = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    // Resolve orderId
    let query = { orderId: orderId };
    const sanitizedId = orderId.replace(/^#/, "");

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query = {
        $or: [
          { _id: orderId },
          { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } },
        ],
      };
    } else {
      query = { orderId: { $regex: new RegExp(`^${sanitizedId}$`, "i") } };
    }

    const order = await Order.findOne(query)
      .populate("userId", "username email phone")
      .populate({
        path: "items.variantId",
        populate: { path: "productId", select: "name title" },
      })
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (!order.userId || !order.userId.email) {
      // Fallback to guest email if stored on order (if applicable) or error
      // Assuming order.customerEmail might exist for guest checkout in future, but for now strict user check
      return res.status(400).json({
        success: false,
        message: "User email not found for this order. Cannot send invoice.",
      });
    }

    // Enhance order items for template (flatten variant structure if needed)
    // The template expects item.productName and item.price.
    // The query above populates variants. We need to ensure structure matches.
    // The email service uses: item.productName || item.productId?.name
    // Our population matches that mostly.

    // Send Email
    await emailService.sendInvoiceEmail(order.userId, order);

    res.status(200).json({
      success: true,
      message: "Invoice email sent successfully",
    });
  } catch (err) {
    console.error("❌ Admin Error sending invoice:", err);
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
  sendOrderInvoice,
};
