const Cart = require("../../models/Cart");
const crypto = require("crypto");
const { CHECKOUT_SESSION_MS } = require("../../../resources/constants");

/**
 * Start Checkout - Lock cart for atomic order creation
 * POST /cart/start-checkout
 */
const startCheckout = async (req, res) => {
  try {
    const { userId, cartId: bodyCartId } = req.body;
    // Get cartId from body or cookies (CART_ID constant usually "cartId")
    const cartId = bodyCartId || req.cookies?.cartId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        errorCode: "MISSING_USER_ID",
        message: "User ID is required",
      });
    }

    // 1. Try to find user's existing cart (excluding ordered/abandoned)
    let cart = await Cart.findOne({
      userId,
      status: { $in: ["active", "checkout"] },
    });

    // 2. If not found, look for anonymous cart to CLAIM
    if (!cart && cartId) {
      const anonymousCart = await Cart.findOne({ cartId, userId: null });
      if (anonymousCart) {
        console.log(`� Claiming anonymous cart ${cartId} for user ${userId}`);
        anonymousCart.userId = userId;
        cart = await anonymousCart.save();
      }
    }

    // 3. If STILL not found, CREATE a new cart for the user
    if (!cart) {
      console.log(
        `🆕 Creating new cart for user ${userId} (No existing or anonymous cart found)`
      );
      cart = await Cart.create({
        userId,
        cartId: `usr_${userId}_${Date.now()}`, // Generate a unique cartId
        items: [],
        status: "active",
      });
    }

    // 4. Now perform the atomic lock/status update on the identified cart
    // Use findOneAndUpdate to ensure atomic state transition
    const lockedCart = await Cart.findOneAndUpdate(
      {
        _id: cart._id,
        // Allow checkout if active OR already in checkout (retry/refresh)
        status: { $in: ["active", "checkout"] },
      },
      {
        $set: {
          status: "checkout",
          checkoutToken: `chk_${Date.now()}_${crypto
            .randomBytes(8)
            .toString("hex")}`,
          checkoutStartedAt: new Date(),
          checkoutExpiry: new Date(Date.now() + CHECKOUT_SESSION_MS), // 5 min TTL
        },
      },
      { new: true }
    );

    if (!lockedCart) {
      // This technically shouldn't happen unless status is 'ordered' or 'abandoned'
      // or if the cart was deleted concurrently
      return res.status(409).json({
        success: false,
        errorCode: "CART_ALREADY_IN_CHECKOUT_OR_ORDERED",
        message:
          "Checkout already in progress, cart ordered, or invalid status",
        debug: {
          userId,
          cartId: cart._id,
          currentStatus: cart.status,
        },
      });
    }

    cart = lockedCart; // Use the updated locked cart

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
