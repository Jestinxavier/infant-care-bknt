const Order = require("../../models/Order");
const User = require("../../models/user");
const logger = require("../../utils/logger");

/**
 * POST /api/v1/orders/guest-claim
 * Attach a guest order to the authenticated account when the order email
 * matches the signed-in user's email.
 */
const guestClaim = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to claim this order.",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const user = await User.findById(userId).select("email");
    if (!user?.email) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const normalizedEmail = user.email.toLowerCase().trim();
    const order = await Order.findOne({
      orderId: String(orderId).toUpperCase(),
      isGuestOrder: true,
      "guestInfo.email": normalizedEmail,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message:
          "No matching guest order found for this account email.",
      });
    }

    if (order.userId?.toString() === userId) {
      return res.status(200).json({
        success: true,
        message: "Order already linked to your account",
        orderId: order.orderId,
      });
    }

    if (order.userId) {
      return res.status(409).json({
        success: false,
        message: "This guest order is already linked to another account.",
      });
    }

    order.userId = userId;
    await order.save();

    logger.info(`✅ Guest order claimed: ${order.orderId} by user ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Guest order linked to your account",
      orderId: order.orderId,
    });
  } catch (error) {
    logger.error("❌ Error claiming guest order:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { guestClaim };
