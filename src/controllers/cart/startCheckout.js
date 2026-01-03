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

    // 1. FIRST: Try to find the cart by cartId (prioritize the cart from cookie/header)
    // This ensures we use the cart with the coupon applied
    let cart = null;

    console.log(
      `🔍 startCheckout: userId=${userId}, bodyCartId=${bodyCartId}, cookieCartId=${req.cookies?.cartId}, using cartId=${cartId}`
    );

    if (cartId) {
      cart = await Cart.findOne({
        cartId,
        status: { $in: ["active", "checkout"] },
      });

      console.log(
        `🔍 Cart lookup by cartId "${cartId}":`,
        cart
          ? `found (userId=${cart.userId}, coupon=${JSON.stringify(
              cart.coupon
            )})`
          : "NOT FOUND"
      );

      if (cart) {
        // If cart exists but belongs to no user OR this user, claim/use it
        if (!cart.userId || cart.userId.toString() === userId.toString()) {
          if (!cart.userId) {
            console.log(`🏷 Claiming cart ${cartId} for user ${userId}`);
            cart.userId = userId;
            await cart.save();
          }
          console.log(`✅ Using cart from cartId: ${cartId}`);
        } else {
          // Cart belongs to different user - don't use it
          console.log(
            `⚠️ Cart ${cartId} belongs to different user, will find user's own cart`
          );
          cart = null;
        }
      }
    }

    // 2. If no cart found by cartId, look for user's existing cart
    if (!cart) {
      cart = await Cart.findOne({
        userId,
        status: { $in: ["active", "checkout"] },
      });

      if (cart) {
        console.log(`📦 Found user's existing cart: ${cart.cartId}`);
      }
    }

    // 3. If STILL not found, CREATE a new cart for the user
    if (!cart) {
      console.log(
        `🆕 Creating new cart for user ${userId} (No existing cart found)`
      );
      cart = await Cart.create({
        userId,
        cartId: `usr_${userId}_${Date.now()}`, // Generate a unique cartId
        items: [],
        status: "active",
      });
    }

    // 4. Idempotency Check: If cart is already in valid checkout, return existing session
    if (cart.status === "checkout" && cart.checkoutExpiry > new Date()) {
      console.log(
        `♻️ Idempotent checkout: Returning existing session for cart ${cart.cartId}`
      );
      return res.status(200).json({
        success: true,
        message: "Checkout already in progress",
        checkoutToken: cart.checkoutToken,
        expiresAt: cart.checkoutExpiry,
      });
    }

    // 5. Atomic lock/status update
    // Only move to checkout if status is 'active' (or if we decide to force refresh expired checkout)
    const lockedCart = await Cart.findOneAndUpdate(
      {
        _id: cart._id,
        status: { $in: ["active", "checkout"] }, // Allow re-locking if needed, but idempotency above handles most cases
      },
      {
        $set: {
          status: "checkout",
          checkoutToken: `chk_${Date.now()}_${crypto
            .randomBytes(8)
            .toString("hex")}`,
          checkoutStartedAt: new Date(),
          checkoutExpiry: new Date(Date.now() + CHECKOUT_SESSION_MS),
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
