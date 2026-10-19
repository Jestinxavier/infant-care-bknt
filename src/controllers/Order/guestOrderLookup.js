const Order = require("../../models/Order");
const logger = require("../../utils/logger");
const escapeRegex = require("../../utils/escapeRegex");

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
 * GET /api/v1/orders/guest-lookup?orderId=&email=&phone=
 *
 * Look up a single guest order by order number + (email OR phone).
 * Rate-limited and requires no auth. Returns only the fields the customer
 * needs to view — never the raw `guestInfo`, `userId`, or internal fields.
 */
const guestOrderLookup = async (req, res) => {
  try {
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

    const order = await Order.findOne({
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

    const shipping = order.shippingAddress || {};

    res.status(200).json({
      success: true,
      order: {
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
          name: item.name,
          sku: item.sku,
          variantName: item.variantName,
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
      },
    });
  } catch (error) {
    logger.error("❌ Error in guest order lookup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = { guestOrderLookup };
