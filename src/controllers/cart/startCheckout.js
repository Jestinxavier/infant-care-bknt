const Cart = require("../../models/Cart");
const crypto = require("crypto");

/**
 * Start Checkout - Lock cart for atomic order creation
 * POST /cart/start-checkout
 */
const startCheckout = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        errorCode: "MISSING_USER_ID",
        message: "User ID is required",
      });
    }

    // Attempt to lock cart atomically
    const cart = await Cart.findOneAndUpdate(
      {
        userId,
        status: "active", // Only lock if cart is active
      },
      {
        status: "checkout",
        checkoutToken: `chk_${Date.now()}_${crypto
          .randomBytes(8)
          .toString("hex")}`,
        checkoutStartedAt: new Date(),
        checkoutExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 min TTL
      },
      { new: true }
    );

    if (!cart) {
      return res.status(409).json({
        success: false,
        errorCode: "CART_ALREADY_IN_CHECKOUT_OR_ORDERED",
        message: "Checkout already in progress or cart has been ordered",
      });
    }

    console.log(
      `🔒 Checkout started for user ${userId}, token: ${cart.checkoutToken}`
    );

    return res.status(200).json({
      success: true,
      message: "Checkout started successfully",
      checkoutToken: cart.checkoutToken,
      expiresAt: cart.checkoutExpiry,
    });
  } catch (error) {
    console.error("❌ Checkout start error:", error);
    return res.status(500).json({
      success: false,
      errorCode: "INTERNAL_ERROR",
      message: "Failed to start checkout",
    });
  }
};

module.exports = startCheckout;
