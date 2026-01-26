const SiteSetting = require("../../models/SiteSetting");
const Cart = require("../../models/Cart");

/**
 * GET /api/v1/payment/options
 * Get available payment options based on cart status and global settings.
 */
const getPaymentOptions = async (req, res) => {
  try {
    const userId = req.user?._id;
    const cartId = req.header("x-cart-id"); // Assuming standard header for cart ID

    // 1. Validation: "Check the cart has items"
    // We need to find the cart first.
    let cart = null;
    const commonQuery = { status: { $in: ["active", "checkout"] } };

    if (userId) {
      cart = await Cart.findOne({ userId, ...commonQuery });
    } else if (cartId) {
      cart = await Cart.findOne({ cartId, ...commonQuery });
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Cannot fetch payment options.",
        options: [],
      });
    }

    // 2. Fetch Global Setting
    const setting = await SiteSetting.findOne({ key: "payment_methods" });

    if (!setting || !setting.value || !setting.value.methods) {
      // Fallback or empty if not configured
      return res.json({
        success: true,
        options: [],
      });
    }

    // 3. Filter Enabled Options
    const enabledOptions = setting.value.methods.filter(
      (method) => method.isEnabled,
    );

    res.json({
      success: true,
      options: enabledOptions,
    });
  } catch (error) {
    console.error("Error fetching payment options:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment options",
      error: error.message,
    });
  }
};

module.exports = {
  getPaymentOptions,
};
