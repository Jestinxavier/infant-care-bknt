/**
 * Helper: Check cart status and handle checkout expiry
 * Returns true if cart can be mutated, false otherwise
 * Responds to client if cart is locked
 */
const checkCartMutation = async (cart, res) => {
  if (cart.status !== "active") {
    // Check if checkout expired
    if (cart.status === "checkout" && cart.checkoutExpiry < new Date()) {
      // Reset to active
      cart.status = "active";
      cart.checkoutToken = null;
      cart.checkoutStartedAt = null;
      cart.checkoutExpiry = null;
      await cart.save();
      return true; // Allow mutation after reset
    } else {
      // Cart is locked
      res.status(409).json({
        success: false,
        errorCode: "CART_LOCKED",
        message: "Cannot modify cart during checkout or after order creation",
      });
      return false;
    }
  }
  return true; // Cart is active, allow mutation
};

module.exports = checkCartMutation;
