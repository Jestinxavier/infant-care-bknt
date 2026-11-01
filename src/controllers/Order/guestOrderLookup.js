const Order = require("../../models/Order");
const logger = require("../../utils/logger");
const escapeRegex = require("../../utils/escapeRegex");
const { formatVariantName } = require("../../utils/formatVariantName");
const {
  createGuestOrderToken,
  verifyGuestOrderToken,
} = require("../../utils/guestOrderToken");

/**
 * Convert a Mongoose `Map` (or plain object) into a plain object so it
 * serialises correctly in the JSON response.
 */
const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value === "object") return value;
  return {};
};

/**
 * Shape an order for the public guest tracking page. Never exposes the raw
 * `guestInfo`, `userId`, or internal fields.
 */
const formatGuestOrder = (order) => {
  const shipping = order.shippingAddress || {};

  return {
    orderId: order.orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt || order.createdAt,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    codCost: order.codCost || 0,
    discount: order.discount || 0,
    coupon: order.coupon
      ? {
          code: order.coupon.code,
          discountAmount: order.coupon.discountAmount,
        }
      : null,
    itemCount: (order.items || []).reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    ),
    items: (order.items || []).map((item) => ({
      name: formatVariantName(item.name),
      sku: item.sku,
      variantName: item.variantName
        ? formatVariantName(item.variantName)
        : null,
      variantAttributes: toPlainObject(item.variantAttributes),
      quantity: item.quantity,
      price: item.price,
      image: item.image || item.variantImage || null,
      isGift: item.isGift || false,
      selectedGift: item.selectedGift || null,
    })),
    shippingAddress: {
      fullName: shipping.fullName || shipping.name,
      phone: shipping.phone,
      houseName: shipping.houseName,
      street: shipping.street,
      addressLine1: shipping.addressLine1,
      addressLine2: shipping.addressLine2,
      city: shipping.city,
      district: shipping.district,
      state: shipping.state,
      pincode: shipping.pincode,
      country: shipping.country,
    },
    trackingId: order.trackingId || null,
    deliveryNote: order.deliveryNote || null,
    deliveryPartner: order.deliveryPartner || null,
    fulfillmentAdditionalInfo: order.fulfillmentAdditionalInfo || [],
    statusHistory: (order.statusHistory || []).map((entry) => ({
      status: entry.status,
      timestamp: entry.timestamp,
      note: entry.note,
    })),
  };
};

/**
 * GET /api/v1/orders/guest-lookup?orderId=&email=&phone=
 * GET /api/v1/orders/guest-lookup?token=
 *
 * Look up a single guest order by order number + (email OR phone), or reopen
 * it with the signed access token issued by an earlier successful lookup.
 * Rate-limited and requires no auth.
 */
const guestOrderLookup = async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    let order;

    if (token) {
      let payload;
      try {
        payload = verifyGuestOrderToken(token);
      } catch {
        return res.status(401).json({
          success: false,
          code: "INVALID_TOKEN",
          message: "This order link is invalid or has expired.",
        });
      }

      order = await Order.findOne({
        _id: payload.orderId,
        isGuestOrder: true,
      })
        .populate("deliveryPartner", "name trackingUrlTemplate")
        .lean();

      if (!order) {
        return res.status(401).json({
          success: false,
          code: "INVALID_TOKEN",
          message: "This order link is invalid or has expired.",
        });
      }
    } else {
      const orderId = String(req.query.orderId || "").trim();
      const email = String(req.query.email || "").trim().toLowerCase();
      const phoneRaw = String(req.query.phone || "").trim();

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Order number is required",
        });
      }

      // Build the contact verification conditions (email OR phone).
      const contactConditions = [];

      if (email) {
        contactConditions.push({ "guestInfo.email": email });
      }

      if (phoneRaw) {
        // Stored phone may include a country code / separators, so match on the
        // last 10 digits (covers "+91 98765 43210", "09876543210", "9876543210").
        const digits = phoneRaw.replace(/\D/g, "");
        const last10 = digits.slice(-10);
        if (last10.length >= 10) {
          const phoneRegex = new RegExp(`${escapeRegex(last10)}$`);
          contactConditions.push(
            { "guestInfo.phone": phoneRegex },
            { "shippingAddress.phone": phoneRegex },
          );
        }
      }

      if (contactConditions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please provide the email or phone number used for the order",
        });
      }

      order = await Order.findOne({
        orderId: orderId.toUpperCase(),
        isGuestOrder: true,
        $or: contactConditions,
      })
        .populate("deliveryPartner", "name trackingUrlTemplate")
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found. Please check your order number and email/phone.",
        });
      }
    }

    res.status(200).json({
      success: true,
      // Lets the browser reopen this order after a reload without asking for
      // the contact details again. Stored client-side only.
      accessToken: token || createGuestOrderToken(order),
      order: formatGuestOrder(order),
    });
  } catch (error) {
    logger.error("❌ Error in guest order lookup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = { guestOrderLookup };
