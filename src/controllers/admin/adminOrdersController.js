const Order = require("../../models/Order");
const User = require("../../models/user");
const mongoose = require("mongoose");
const emailService = require("../../services/emailService");
const { ORDER_DATE_RESTRICTION_DAYS } = require("../../config/constants");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const { restoreOrderStock } = require("../../utils/orderStockRestore");
const { neutralizeCsvFormula } = require("../../utils/reportCsv");
const { ensureInvoiceNumber } = require("../../services/gstService");
const {
  canTransitionStatus,
} = require("../../features/order/rules/order.rules");
const {
  invalidateOrderReportCaches,
} = require("./orderCacheInvalidation");
const logger = require("../../utils/logger");
const { resolveAttributeLabels } = require("../../utils/formatCartResponse");
const { formatVariantName } = require("../../utils/formatVariantName");
const { cacheGetOrSet } = require("../../utils/redisCache");

const escapeRegex = require("../../utils/escapeRegex");

const MAX_EXPORT_ORDERS = 20000;

/**
 * Resolve an admin-supplied order identifier (custom orderId, "#orderId", or
 * Mongo _id) to a query. Returns null for non-string input so a body like
 * `{ orderId: {} }` gets a 400 instead of crashing into a 500.
 */
function buildOrderLookupQuery(orderId) {
  if (typeof orderId !== "string" || !orderId.trim()) return null;
  const trimmed = orderId.trim();
  const byCustomId = {
    orderId: {
      $regex: new RegExp(`^${escapeRegex(trimmed.replace(/^#/, ""))}$`, "i"),
    },
  };
  return mongoose.Types.ObjectId.isValid(trimmed)
    ? { $or: [{ _id: trimmed }, byCustomId] }
    : byCustomId;
}

const invalidOrderIdResponse = (res) =>
  res.status(400).json({ success: false, message: "Order ID is required" });

/**
 * Oldest order date the user may view, or null when unrestricted. The `admin`
 * role only sees the last ORDER_DATE_RESTRICTION_DAYS days (superadmins see all).
 */
function getOrderRestrictionDate(reqUser) {
  if (reqUser?.role !== "admin") return null;
  const restrictionDate = new Date();
  restrictionDate.setUTCDate(
    restrictionDate.getUTCDate() - ORDER_DATE_RESTRICTION_DAYS,
  );
  restrictionDate.setUTCHours(0, 0, 0, 0);
  return restrictionDate;
}

// Filter values arrive from JSON bodies, so only accept plain strings — an
// object like { $ne: null } would otherwise act as a query operator.
const asFilterString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Build the admin order filter from request data (query or body).
 * Enforces the role-based date restriction for admin users.
 * Throws an error with code "DATE_RESTRICTED" when a too-old `from` is given.
 */
async function buildOrderFilter(requestData, reqUser) {
  const {
    status,
    excludeStatuses,
    paymentStatus,
    paymentMethod,
    customerType, // "guest" | "registered"
    minTotal, // minimum order amount
    maxTotal, // maximum order amount
    search,
    from, // ISO date string (YYYY-MM-DD)
    to, // ISO date string (YYYY-MM-DD)
  } = requestData;

  let filter = {};

  // ===== ROLE-BASED DATE RESTRICTIONS =====
  const restrictionDate = getOrderRestrictionDate(reqUser);
  if (restrictionDate) {
    if (from) {
      const fromDate = new Date(from);
      fromDate.setUTCHours(0, 0, 0, 0);
      if (fromDate < restrictionDate) {
        const error = new Error(
          `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
        );
        error.code = "DATE_RESTRICTED";
        error.maxDate = restrictionDate.toISOString().split("T")[0];
        throw error;
      }
    } else {
      filter.createdAt = { $gte: restrictionDate };
    }
  }

  // ===== DATE RANGE FILTERING =====
  // Backend normalization: from (00:00:00 IST) to (23:59:59.999 IST)
  if (from || to) {
    filter.createdAt = filter.createdAt || {};

    if (from) {
      // Construct ISO string with IST offset for start of day
      const fromDate = new Date(`${from}T00:00:00+05:30`);
      filter.createdAt.$gte = fromDate;
    }

    if (to) {
      // Construct ISO string with IST offset for end of day
      const toDate = new Date(`${to}T23:59:59.999+05:30`);
      filter.createdAt.$lte = toDate;
    }
  }

  if (asFilterString(status)) {
    filter.orderStatus = asFilterString(status);
  }

  // Optional exclusion list (e.g. hide cancelled/returned from COD collection
  // lists). Kept separate from `status` so a specific status filter still wins.
  const excludedStatuses = Array.isArray(excludeStatuses)
    ? excludeStatuses
    : typeof excludeStatuses === "string"
      ? excludeStatuses.split(",")
      : [];
  const validStatuses = new Set([
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "returned",
    "cancelled",
  ]);
  const normalizedExcludedStatuses = excludedStatuses
    .map((value) => String(value).trim())
    .filter((value) => validStatuses.has(value));

  if (normalizedExcludedStatuses.length > 0) {
    filter.$and = [
      ...(filter.$and || []),
      { orderStatus: { $nin: normalizedExcludedStatuses } },
    ];
  }

  if (asFilterString(paymentStatus)) {
    filter.paymentStatus = asFilterString(paymentStatus);
  }

  if (asFilterString(paymentMethod)) {
    filter.paymentMethod = asFilterString(paymentMethod);
  }

  // Customer type filter (guest vs registered)
  if (customerType === "guest") {
    filter.isGuestOrder = true;
  } else if (customerType === "registered") {
    filter.isGuestOrder = false;
  }

  // Order amount range filter
  const parsedMinTotal = Number(minTotal);
  const parsedMaxTotal = Number(maxTotal);
  if (
    minTotal !== undefined &&
    minTotal !== null &&
    minTotal !== "" &&
    Number.isFinite(parsedMinTotal)
  ) {
    filter.totalAmount = { ...filter.totalAmount, $gte: parsedMinTotal };
  }
  if (
    maxTotal !== undefined &&
    maxTotal !== null &&
    maxTotal !== "" &&
    Number.isFinite(parsedMaxTotal)
  ) {
    filter.totalAmount = { ...filter.totalAmount, $lte: parsedMaxTotal };
  }

  // Advanced Search
  if (typeof search === "string" && search) {
    const safeSearch = escapeRegex(search);
    const searchRegex = new RegExp(safeSearch, "i");
    // Remove leading '#' for ID searching
    const sanitizedSearch = search.replace(/^#/, "");
    const safeSanitized = escapeRegex(sanitizedSearch);
    const sanitizedRegex = new RegExp(safeSanitized, "i");

    const matchingUsers = await User.find({
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ],
    }).select("_id");

    const matchingUserIds = matchingUsers.map((u) => u._id);

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

  return filter;
}

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
      sortBy = "createdAt",
      sortOrder = -1,
    } = requestData;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    let filter;
    try {
      filter = await buildOrderFilter(requestData, req.user);
    } catch (err) {
      if (err.code === "DATE_RESTRICTED") {
        return res.status(403).json({
          success: false,
          errorCode: "DATE_RESTRICTED",
          message: `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
          maxDate: err.maxDate,
        });
      }
      throw err;
    }

    // Build sort — whitelist the sort field so a client cannot force an
    // in-memory SORT over the whole orders collection on an arbitrary field.
    const ORDER_SORTABLE_FIELDS = new Set([
      "createdAt",
      "placedAt",
      "totalAmount",
      "orderStatus",
    ]);
    const safeSortBy = ORDER_SORTABLE_FIELDS.has(String(sortBy))
      ? String(sortBy)
      : "createdAt";
    const safeSortOrder = parseInt(sortOrder, 10) === 1 ? 1 : -1;
    const sort = {};
    sort[safeSortBy] = safeSortOrder;

    // Get total count
    const total = await Order.countDocuments(filter);

    // Summary: sum of totalAmount across ALL matching orders (not just current page)
    const summaryResult = await Order.aggregate([
      { $match: filter },
      { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } },
    ]);
    const summary = { totalAmount: summaryResult[0]?.totalAmount || 0 };

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
      customerName:
        order.userId?.username ||
        order.userId?.email ||
        order.shippingAddress?.fullName ||
        "Guest",
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
      codCost: order.codCost || 0,
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
      summary,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
    });
  } catch (err) {
    logger.error("❌ Admin Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Admin: Get counts and totals per order status for the filter bar cards.
 * One aggregation replaces the previous per-status list requests.
 */
const ORDER_STATUS_COUNTS = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

const STATUS_COUNTS_CACHE_TTL = 60;

function buildStatusCountsCacheKey(requestData, userRole) {
  const fields = [
    "status",
    "excludeStatuses",
    "paymentStatus",
    "paymentMethod",
    "customerType",
    "minTotal",
    "maxTotal",
    "search",
    "from",
    "to",
  ];

  const parts = fields.map((field) => {
    const value = requestData[field];
    return value === undefined || value === null || value === ""
      ? ""
      : `${field}=${encodeURIComponent(String(value))}`;
  });

  return `admin:orders:status-counts:${userRole || "guest"}:${parts.join("&")}`;
}

const getOrderStatusCounts = async (req, res) => {
  try {
    const requestData = req.method === "POST" ? req.body || {} : req.query;

    let filter;
    try {
      filter = await buildOrderFilter(requestData, req.user);
    } catch (err) {
      if (err.code === "DATE_RESTRICTED") {
        return res.status(403).json({
          success: false,
          errorCode: "DATE_RESTRICTED",
          message: `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
          maxDate: err.maxDate,
        });
      }
      throw err;
    }

    const cacheKey = buildStatusCountsCacheKey(requestData, req.user?.role);

    const result = await cacheGetOrSet(
      cacheKey,
      STATUS_COUNTS_CACHE_TTL,
      async () => {
        const grouped = await Order.aggregate([
          { $match: filter },
          {
            $group: {
              _id: "$orderStatus",
              count: { $sum: 1 },
              amount: { $sum: "$totalAmount" },
            },
          },
        ]);

        const byStatus = new Map(grouped.map((row) => [row._id, row]));
        const counts = ORDER_STATUS_COUNTS.map((status) => ({
          status,
          count: byStatus.get(status)?.count || 0,
          amount: byStatus.get(status)?.amount || 0,
        }));

        return {
          counts,
          total: counts.reduce((sum, item) => sum + item.count, 0),
          totalAmount: counts.reduce((sum, item) => sum + item.amount, 0),
        };
      },
    );

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("❌ Admin Error fetching order status counts:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Admin: Get single order
 */
const getOrderById = async (req, res) => {
  try {
    const query = buildOrderLookupQuery(req.params.orderId);
    if (!query) return invalidOrderIdResponse(res);

    const order = await Order.findOne(query)
      .populate({
        path: "items.productId",
        select:
          "name title images description attributes options variantOptions",
      })
      .populate("userId", "username email phone")
      .populate("deliveryPartner")
      .populate({
        path: "statusHistory.updatedBy",
        select: "username email",
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Same role-based window as the order list, so an admin can't read older
    // orders (and their customer details) by opening them directly.
    const restrictionDate = getOrderRestrictionDate(req.user);
    if (restrictionDate && new Date(order.createdAt) < restrictionDate) {
      return res.status(403).json({
        success: false,
        errorCode: "DATE_RESTRICTED",
        message: `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
        maxDate: restrictionDate.toISOString().split("T")[0],
      });
    }

    // Resolve raw variant attribute values (e.g. "3-6-months", "red") to
    // human-readable labels (e.g. "3-6 Month", "Red") using the product's
    // variantOptions. Falls back to the raw value when no match is found.
    const items = (order.items || []).map((item) => {
      const variantOptions = item.productId?.variantOptions;
      if (
        !item.variantAttributes ||
        !Array.isArray(variantOptions) ||
        variantOptions.length === 0
      ) {
        return item;
      }
      return {
        ...item,
        variantAttributes: resolveAttributeLabels(
          item.variantAttributes,
          variantOptions,
        ),
      };
    });

    res.status(200).json({
      success: true,
      order: {
        ...order,
        items,
        _id: order._id?.toString(),
      },
    });
  } catch (err) {
    logger.error("❌ Admin Error fetching order:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Admin: Update order status
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status, trackingId, deliveryNote } = req.body;

    const query = buildOrderLookupQuery(orderId);
    if (!query) return invalidOrderIdResponse(res);

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
        "returned",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
      }

      // Enforce state machine: only allow valid forward/backward transitions
      if (
        status !== currentOrder.orderStatus &&
        !canTransitionStatus(currentOrder.orderStatus, status)
      ) {
        return res.status(422).json({
          success: false,
          errorCode: "INVALID_TRANSITION",
          message: `Cannot transition order from "${currentOrder.orderStatus}" to "${status}"`,
        });
      }

      // Validation: If status is changing to 'shipped' or 'delivered', require Partner and Tracking
      if (
        (status === "shipped" || status === "delivered") &&
        status !== currentOrder.orderStatus
      ) {
        // Check incoming update OR existing value on order.
        // Null/undefined falls back to the already-stored partner so orders
        // that were fulfilled earlier can be moved to shipped/delivered
        // without re-sending fulfillment data.
        const partnerValue =
          req.body.deliveryPartner ?? currentOrder.deliveryPartner;
        const tracking =
          trackingId !== undefined ? trackingId : currentOrder.trackingId;

        const partnerIsValid =
          !!partnerValue &&
          (typeof partnerValue !== "object" ||
            Array.isArray(partnerValue) ||
            partnerValue instanceof mongoose.Types.ObjectId ||
            !!partnerValue.name);

        if (!partnerIsValid || !tracking) {
          return res.status(400).json({
            success: false,
            message:
              "Delivery Partner and Tracking ID are required when marking order as Shipped or Delivered.",
          });
        }
      }

      updateFields.orderStatus = status;

      // Returned: money goes back to the customer. Gateway refund is handled
      // manually outside the admin flow, so here we just record the refund.
      if (
        status === "returned" &&
        currentOrder.orderStatus !== "returned" &&
        currentOrder.paymentStatus === "paid"
      ) {
        updateFields.paymentStatus = "refunded";
        updateFields.refundedAt = new Date();
      }
    }

    // Tracking & Note & Partner Update Logic
    if (trackingId !== undefined) updateFields.trackingId = trackingId;
    if (deliveryNote !== undefined) updateFields.deliveryNote = deliveryNote;

    // Treat null/undefined as "no change" so updating status/notes/tracking
    // does not wipe an existing delivery partner.
    if (req.body.deliveryPartner != null) {
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
            .findOne({
              name: {
                $regex: new RegExp(`^${escapeRegex(partnerName)}$`, "i"),
              },
            });

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
            (item) => item.key && item.key.toLowerCase() === "tracking url",
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
            name: { $regex: new RegExp(`^${escapeRegex(partnerValue)}$`, "i") },
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

    // Restore product stock when cancelling or returning an order (simple,
    // variant, bundle, gift). This runs only after the conditional update below
    // succeeds, so concurrent cancel requests can't both restore stock.
    const needsStockRestore =
      (status === "cancelled" || status === "returned") &&
      currentOrder.orderStatus !== status &&
      currentOrder.items?.length > 0;

    // 3. Perform Update — include the orderStatus we read as a match condition so that
    //    a concurrent status change causes a 409 rather than silently overwriting it.
    const updateMatchCondition = { _id: currentOrder._id };
    if (status && status !== currentOrder.orderStatus) {
      updateMatchCondition.orderStatus = currentOrder.orderStatus;
    }

    const order = await Order.findOneAndUpdate(
      updateMatchCondition,
      { $set: updateFields },
      { new: true },
    )
      .populate("userId", "username email")
      .populate("deliveryPartner")
      .lean();

    if (!order) {
      return res.status(409).json({
        success: false,
        message:
          "Order was modified by another request. Please refresh and try again.",
      });
    }

    if (needsStockRestore) {
      try {
        await restoreOrderStock(currentOrder);
      } catch (restoreErr) {
        logger.error("Failed to restore stock on order cancel/return", {
          orderId: currentOrder._id,
          error: restoreErr.message,
        });
        // Roll the status change back so the admin can retry the cancel/return.
        await Order.updateOne(
          { _id: currentOrder._id, orderStatus: status },
          {
            $set: {
              orderStatus: currentOrder.orderStatus,
              paymentStatus: currentOrder.paymentStatus,
              refundedAt: currentOrder.refundedAt ?? null,
            },
            $pop: { statusHistory: 1 },
          },
        );
        return res.status(500).json({
          success: false,
          message:
            "Order status could not be updated. Stock restore failed. Please try again.",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: {
        ...order,
        _id: order._id?.toString(),
      },
    });

    // Any status or payment-status change affects dashboards/reports. Flush
    // when the order status changed, or when this update flipped payment status
    // (e.g. COD marked paid, paid → refunded on a return).
    const statusChanged =
      status !== undefined && currentOrder.orderStatus !== status;
    const paymentStatusChanged =
      updateFields.paymentStatus !== undefined &&
      updateFields.paymentStatus !== currentOrder.paymentStatus;

    if (statusChanged || paymentStatusChanged) {
      invalidateOrderReportCaches(
        `order update (status=${status || currentOrder.orderStatus}, payment=${updateFields.paymentStatus || currentOrder.paymentStatus})`,
      );
    }

    // Resolve the email recipient — works for both registered users and guests
    const emailRecipient =
      order.userId ||
      (order.isGuestOrder && order.guestInfo?.email
        ? {
            email: order.guestInfo.email,
            username: order.guestInfo.name || "Customer",
          }
        : null);

    // Send shipment email if status changed to shipped
    if (
      status === "shipped" &&
      currentOrder.orderStatus !== "shipped" &&
      emailRecipient?.email
    ) {
      emailService
        .sendShipmentEmail(emailRecipient, order)
        .catch((err) =>
          logger.error("Shipment email failed", {
            orderId: order._id,
            error: err.message,
          }),
        );
    }

    // Ask for a review once the customer has received the order. This runs
    // only on the transition to delivered, so repeated updates do not resend it.
    if (
      status === "delivered" &&
      currentOrder.orderStatus !== "delivered" &&
      emailRecipient?.email
    ) {
      emailService
        .sendReviewRequestEmail(order)
        .catch((err) =>
          logger.error("Review request email failed", {
            orderId: order._id,
            error: err.message,
          }),
        );
    }

    // Skip cancellation email for:
    // 1. Explicit flag from the frontend (skipCancelEmail: true)
    // 2. Auto-detected: order was never confirmed or paid — no point emailing the customer
    //    (paymentStatus: pending|failed + orderStatus: pending)
    const skipCancelEmail =
      req.body.skipCancelEmail === true ||
      (["pending", "failed"].includes(currentOrder.paymentStatus) &&
        currentOrder.orderStatus === "pending");

    if (
      status === "cancelled" &&
      currentOrder.orderStatus !== "cancelled" &&
      emailRecipient?.email &&
      !skipCancelEmail
    ) {
      emailService
        .sendOrderCancelledEmail(emailRecipient, order)
        .catch((err) =>
          logger.error("Order cancelled email failed", {
            orderId: order._id,
            error: err.message,
          }),
        );
    }
  } catch (err) {
    logger.error("Admin error updating order status", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Admin: Send invoice email
 */
const MAX_INVOICE_NUMBER_BATCH = 100;

/**
 * Admin: issue GST invoice numbers before the dashboard builds invoice PDFs.
 * Body: { orderIds: string[] } (or { orderId }). A number is issued only for
 * a GST order that is a confirmed sale (paid, or COD not cancelled); one
 * already issued is returned as-is. Others get null and print as a plain
 * "Invoice".
 */
const issueInvoiceNumbers = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.orderIds)
      ? req.body.orderIds
      : [req.body.orderId];
    if (ids.length === 0 || ids.length > MAX_INVOICE_NUMBER_BATCH) {
      return res.status(400).json({
        success: false,
        message: `Send between 1 and ${MAX_INVOICE_NUMBER_BATCH} order IDs`,
      });
    }

    const invoiceNumbers = {};
    // Sequential so numbers follow the order the admin selected.
    for (const id of ids) {
      const query = buildOrderLookupQuery(id);
      if (!query) return invalidOrderIdResponse(res);
      const order = await Order.findOne(query)
        .select("_id orderId gst paymentStatus paymentMethod orderStatus")
        .lean();
      if (!order) {
        invoiceNumbers[id] = null;
        continue;
      }
      if (order.gst?.invoiceNumber) {
        invoiceNumbers[id] = order.gst.invoiceNumber;
        continue;
      }
      const isConfirmedSale =
        order.paymentStatus === "paid" ||
        (order.paymentMethod === PAYMENT_METHODS.COD &&
          order.orderStatus !== "cancelled");
      invoiceNumbers[id] =
        order.gst && isConfirmedSale
          ? await ensureInvoiceNumber(order._id)
          : null;
    }

    res.status(200).json({ success: true, invoiceNumbers });
  } catch (err) {
    logger.error("Admin error issuing invoice numbers", { error: err.message });
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const sendOrderInvoice = async (req, res) => {
  try {
    const query = buildOrderLookupQuery(req.body.orderId);
    if (!query) return invalidOrderIdResponse(res);

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

    const recipient = await emailService.getOrderRecipient(order);

    if (!recipient?.email) {
      return res.status(400).json({
        success: false,
        message:
          "Customer email not found for this order. Cannot send invoice.",
      });
    }

    // Enhance order items for template (flatten variant structure if needed)
    // The template expects item.productName and item.price.
    // The query above populates variants. We need to ensure structure matches.
    // The email service uses: item.productName || item.productId?.name
    // Our population matches that mostly.

    // Send Email
    await emailService.sendInvoiceEmail(recipient, order);

    res.status(200).json({
      success: true,
      message: "Invoice email sent successfully",
    });
  } catch (err) {
    logger.error("❌ Admin Error sending invoice:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/**
 * Admin: Manually mark a PhonePe pending order as paid
 * Sets paymentStatus = "paid", orderStatus = "confirmed", stores phonepeTransactionId, sends invoice.
 */
const markOrderAsPaid = async (req, res) => {
  try {
    const { orderId, phonepeTransactionId } = req.body;

    const query = buildOrderLookupQuery(orderId);
    if (!query) return invalidOrderIdResponse(res);
    if (
      typeof phonepeTransactionId !== "string" ||
      !phonepeTransactionId.trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "PhonePe Transaction ID is required",
        });
    }

    const order = await Order.findOne(query)
      .populate("userId", "username email phone")
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Guard: only allow for PhonePe/Razorpay + uncollected payment
    if (
      order.paymentMethod !== PAYMENT_METHODS.PHONEPE &&
      order.paymentMethod !== PAYMENT_METHODS.RAZORPAY
    ) {
      return res.status(400).json({
        success: false,
        message: `This order uses ${order.paymentMethod}. Manual paid marking is only for online (PhonePe/Razorpay) orders.`,
      });
    }
    if (["cancelled", "returned"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark a ${order.orderStatus} order as paid.`,
      });
    }
    if (!["pending", "failed"].includes(order.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order payment is already ${order.paymentStatus}.`,
      });
    }

    // Only an unpaid pending order needs its status confirmed. Orders that
    // already moved into processing/shipped/delivered must keep their status.
    const nextOrderStatus =
      order.orderStatus === "pending" ? "confirmed" : order.orderStatus;
    const history = order.statusHistory || [];
    history.push({
      status: nextOrderStatus,
      timestamp: new Date(),
      note: `Manually marked as paid by admin. Transaction ID: ${phonepeTransactionId.trim()}`,
      updatedBy: req.user?._id,
    });

    // Conditional on the payment still being unpaid, so a webhook confirming
    // the same payment concurrently can't produce a second paid transition
    // (and a second confirmation email).
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: { $in: ["pending", "failed"] } },
      {
        $set: {
          paymentStatus: "paid",
          ...(nextOrderStatus !== order.orderStatus
            ? { orderStatus: nextOrderStatus }
            : {}),
          phonepeTransactionId: phonepeTransactionId.trim(),
          statusHistory: history,
        },
      },
      { new: true },
    )
      .populate("userId", "username email phone")
      .lean();

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Order payment changed meanwhile. Refresh and try again.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        nextOrderStatus === "confirmed"
          ? "Order marked as paid and confirmed. Invoice email will be sent."
          : "Order marked as paid. Invoice email will be sent.",
      order: { ...updated, _id: updated._id?.toString() },
    });

    // Payment status flipped to paid — flush all report caches
    invalidateOrderReportCaches("order marked as paid");

    // Send invoice email asynchronously (don't block the response)
    emailService
      .sendOrderConfirmationEmail(updated)
      .catch((err) =>
        logger.error("❌ Invoice email failed after mark-paid:", err.message),
      );
  } catch (err) {
    logger.error("❌ Admin Error marking order as paid:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Admin: Mark a COD order as paid (cash collected manually)
 * Sets paymentStatus = "paid" without touching orderStatus, records status history.
 */
const markCodOrderAsPaid = async (req, res) => {
  try {
    const query = buildOrderLookupQuery(req.body.orderId);
    if (!query) return invalidOrderIdResponse(res);

    const order = await Order.findOne(query)
      .populate("userId", "username email phone")
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Guard: only allow for COD + an uncollected payment
    if (order.paymentMethod !== PAYMENT_METHODS.COD) {
      return res.status(400).json({
        success: false,
        message: `This order uses ${order.paymentMethod}. COD marking is only for Cash on Delivery orders.`,
      });
    }
    if (["cancelled", "returned"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark a ${order.orderStatus} order as paid.`,
      });
    }
    if (order.orderStatus !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "A COD order must be delivered before it can be marked as paid.",
      });
    }
    if (!["pending", "failed"].includes(order.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order payment is already ${order.paymentStatus}.`,
      });
    }

    // Build status history entry
    const history = order.statusHistory || [];
    history.push({
      status: order.orderStatus,
      timestamp: new Date(),
      note: "COD payment collected — marked as paid by admin",
      updatedBy: req.user?._id,
    });

    // Conditional so a double-click can't send the invoice twice.
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, paymentStatus: { $in: ["pending", "failed"] } },
      {
        $set: {
          paymentStatus: "paid",
          statusHistory: history,
        },
      },
      { new: true },
    )
      .populate("userId", "username email phone")
      .lean();

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Order payment changed meanwhile. Refresh and try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "COD order marked as paid.",
      order: { ...updated, _id: updated._id?.toString() },
    });

    // Revenue changed — flush all report caches
    invalidateOrderReportCaches("COD marked as paid");

    // Send invoice email asynchronously (don't block the response).
    // `sendInvoiceEmail` resolves guest recipients from the order too.
    emailService
      .sendInvoiceEmail(updated.userId, updated)
      .catch((err) =>
        logger.error(
          "❌ Invoice email failed after COD mark-paid:",
          err.message,
        ),
      );
  } catch (err) {
    logger.error("❌ Admin Error marking COD order as paid:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  // Customer-controlled text (names, addresses) must not run as a formula.
  const str = typeof value === "string" ? neutralizeCsvFormula(value) : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const orderCsvRow = (cells) => cells.map(csvCell).join(",");

const formatCsvDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(d);
};

const lineTotal = (item) => (item.price || 0) * (item.quantity || 1);

function buildOrdersCsv(orders, type) {
  if (type === "items") {
    const header = [
      "Order ID",
      "Date",
      "Order Status",
      "Payment Status",
      "Payment Method",
      "Customer",
      "Customer Phone",
      "Product",
      "SKU",
      "Variant",
      "Qty",
      "Unit Price (INR)",
      "Line Total (INR)",
    ];
    const lines = [header.join(",")];
    for (const o of orders) {
      const customer =
        o.userId?.username ||
        o.userId?.email ||
        o.shippingAddress?.fullName ||
        o.guestInfo?.name ||
        "Guest";
      const phone =
        o.userId?.phone || o.shippingAddress?.phone || o.guestInfo?.phone || "";
      for (const it of o.items || []) {
        const attrs = Array.isArray(it.variantAttributes)
          ? it.variantAttributes
          : Object.entries(it.variantAttributes || {});
        const variant =
          (it.variantName && formatVariantName(it.variantName)) ||
          attrs
            .map(([k, v]) => `${String(k).trim()}: ${String(v).trim()}`)
            .filter(Boolean)
            .join("; ");
        lines.push(
          orderCsvRow([
            o.orderId || o._id,
            formatCsvDate(o.placedAt || o.createdAt),
            o.orderStatus,
            o.paymentStatus,
            o.paymentMethod,
            customer,
            phone,
            formatVariantName(it.name || ""),
            it.variantSku || it.sku || "",
            variant,
            it.quantity,
            it.price,
            lineTotal(it),
          ]),
        );
      }
    }
    return lines.join("\n");
  }

  const header = [
    "Order ID",
    "Date",
    "Order Status",
    "Payment Status",
    "Payment Method",
    "Customer",
    "Customer Email",
    "Customer Phone",
    "Items",
    "Total Items",
    "Subtotal (INR)",
    "Discount (INR)",
    "Shipping (INR)",
    "COD Fee (INR)",
    "Total (INR)",
  ];
  const lines = [header.join(",")];
  for (const o of orders) {
    const items = (o.items || [])
      .map(
        (it) =>
          `${formatVariantName(it.name || "")}${it.variantName ? ` (${formatVariantName(it.variantName)})` : ""} x${it.quantity}`,
      )
      .join(" | ");
    const itemCount = (o.items || []).reduce(
      (s, it) => s + (it.quantity || 0),
      0,
    );
    lines.push(
      orderCsvRow([
        o.orderId || o._id,
        formatCsvDate(o.placedAt || o.createdAt),
        o.orderStatus,
        o.paymentStatus,
        o.paymentMethod,
        o.userId?.username ||
          o.userId?.email ||
          o.shippingAddress?.fullName ||
          o.guestInfo?.name ||
          "Guest",
        o.userId?.email,
        o.userId?.phone || o.shippingAddress?.phone || "",
        items,
        itemCount,
        o.subtotal,
        o.discount,
        o.shippingCost,
        o.codCost || 0,
        o.totalAmount,
      ]),
    );
  }
  return lines.join("\n");
}

/**
 * Admin: Export orders to CSV
 * Supports a scope (selected orderIds or filter criteria) and two formats:
 * "orders" (one row per order) or "items" (one row per line item).
 */
const exportOrders = async (req, res) => {
  try {
    const requestData = req.body || {};
    const { type = "orders", orderIds } = requestData;

    if (type !== "orders" && type !== "items") {
      return res.status(400).json({
        success: false,
        message: "Invalid export type. Use 'orders' or 'items'.",
      });
    }

    // Build filter — enforces the same role-based date restriction as listing
    let filter;
    try {
      filter = await buildOrderFilter(requestData, req.user);
    } catch (err) {
      if (err.code === "DATE_RESTRICTED") {
        return res.status(403).json({
          success: false,
          errorCode: "DATE_RESTRICTED",
          message: `Admins can only view orders from the last ${ORDER_DATE_RESTRICTION_DAYS} days`,
          maxDate: err.maxDate,
        });
      }
      throw err;
    }

    if (Array.isArray(orderIds) && orderIds.length > 0) {
      // The dashboard selects rows by the human-facing `orderId`, but older
      // clients may still send Mongo `_id`s. Support both rather than silently
      // exporting every filtered order when custom IDs are present.
      const rawIds = orderIds
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
      const objectIds = rawIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      const idClauses = [];
      if (rawIds.length > 0) idClauses.push({ orderId: { $in: rawIds } });
      if (objectIds.length > 0) idClauses.push({ _id: { $in: objectIds } });

      if (idClauses.length > 0) {
        filter.$and = [...(filter.$and || []), { $or: idClauses }];
      }
    }

    // The whole export is built in memory, so refuse runaway ranges instead of
    // risking the API process on an unfiltered all-time export.
    const matchingCount = await Order.countDocuments(filter);
    if (matchingCount > MAX_EXPORT_ORDERS) {
      return res.status(413).json({
        success: false,
        errorCode: "EXPORT_TOO_LARGE",
        message: `This export matches ${matchingCount} orders. Narrow the date range or filters to ${MAX_EXPORT_ORDERS} orders or fewer.`,
      });
    }

    const orders = await Order.find(filter)
      .populate("userId", "username email phone")
      .sort({ createdAt: -1 })
      .lean();

    const csv = buildOrdersCsv(orders, type);
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${type}_export_${date}.csv"`,
    );
    res.status(200).send(csv);
  } catch (err) {
    logger.error("Admin order export failed", { error: err.message });
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  issueInvoiceNumbers,
  getAllOrders,
  getOrderStatusCounts,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
  markCodOrderAsPaid,
  exportOrders,
};
