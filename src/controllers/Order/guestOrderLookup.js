const Order = require("../../models/Order");
const logger = require("../../utils/logger");

/**
 * GET /api/v1/orders/guest-lookup?orderId=&email=
 * Look up a guest order by order ID + email (rate-limited, no auth required).
 */
const guestOrderLookup = async (req, res) => {
  try {
    const { orderId, email } = req.query;

    if (!orderId || !email) {
      return res.status(400).json({
        success: false,
        message: "Order ID and email are required",
      });
    }

    const order = await Order.findOne({
      orderId: orderId.toUpperCase(),
      isGuestOrder: true,
      "guestInfo.email": email.toLowerCase().trim(),
    }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found. Please check your order ID and email address.",
      });
    }

    // Return a limited summary — never expose full guestInfo or internal fields
    res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        placedAt: order.placedAt,
        totalAmount: order.totalAmount,
        shippingCost: order.shippingCost,
        discount: order.discount,
        items: order.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
          isGift: item.isGift,
        })),
        shippingAddress: {
          fullName: order.shippingAddress?.fullName || order.shippingAddress?.name,
          city: order.shippingAddress?.city,
          state: order.shippingAddress?.state,
          pincode: order.shippingAddress?.pincode,
        },
        statusHistory: order.statusHistory,
      },
    });
  } catch (error) {
    logger.error("❌ Error in guest order lookup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = { guestOrderLookup };
