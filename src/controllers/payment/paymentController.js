const SiteSetting = require("../../models/SiteSetting");
const Cart = require("../../models/Cart");

/**
 * GET /api/v1/payment/options
 *
 * Returns enabled payment methods for the current checkout cart.
 *
 * Rules:
 * - cartId is REQUIRED (prevents old cart issues)
 * - cart must exist and contain items
 * - payment methods come from global settings
 */
const getPaymentOptions = async (req, res) => {
  try {
    // ✅ 1. Read Cart ID (Checkout must always be cart-specific)
    const cartId = req.header("x-cart-id");

    if (!cartId) {
      return res.status(400).json({
        success: false,
        message: "Cart ID is required for payment options",
      });
    }

    // ✅ 2. Fetch Checkout Cart
    const cart = await Cart.findOne({
      cartId,
      status: { $in: ["active", "checkout"] },
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found or expired",
      });
    }

    // ✅ 3. Ensure Cart Has Items
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Cannot load payment options.",
      });
    }

    // ✅ 4. Load Payment Settings
    const paymentSetting = await SiteSetting.findOne({
      key: "payment_methods",
    });

    const methods = paymentSetting?.value?.methods || [];

    if (methods.length === 0) {
      return res.json({
        success: true,
        options: [],
        message: "No payment methods configured",
      });
    }

    // ✅ 5. Filter Enabled Methods
    const enabledMethods = methods.filter((method) => method.isEnabled);

    return res.json({
      success: true,
      options: enabledMethods,
    });
  } catch (error) {
    console.error("[Payment Options Error]:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment options",
    });
  }
};

module.exports = {
  getPaymentOptions,
};
