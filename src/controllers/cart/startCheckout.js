const Cart = require("../../models/Cart");
const crypto = require("crypto");
const logger = require("../../utils/logger");
const { generateCartId } = require("../../utils/cartIdGenerator");
const {
  CHECKOUT_SESSION_MS,
  CART_ID,
} = require("../../../resources/constants");

/**
 * Start Checkout - Lock cart for atomic order creation
 * POST /cart/start-checkout
 */
const startCheckout = async (req, res) => {
  try {
    const { cartId: bodyCartId } = req.body;
    // Resolve userId from JWT (set by optionalVerifyToken middleware).
    // Never trust userId from the request body — callers cannot self-attest identity.
    const userId = req.user?.id || null;
    // Get cartId from body or cookies (use CART_ID constant = "cart_id")
    const cartId = bodyCartId || req.cookies?.[CART_ID];

    // userId is optional — guests have no userId
    const isGuest = !userId;

    if (isGuest && !cartId) {
      return res.status(400).json({
        success: false,
        errorCode: "MISSING_CART",
        message: "Cart not found. Please add items to your cart first.",
      });
    }

    // 1. FIRST: Try to find the cart by cartId (prioritize the cart from cookie/header)
    // This ensures we use the cart with the coupon applied
    let cart = null;

    logger.info(
      `🔍 startCheckout: userId=${userId ?? "guest"}, bodyCartId=${bodyCartId}, cookieCartId=${req.cookies?.[CART_ID]}, using cartId=${cartId}`
    );

    if (cartId) {
      cart = await Cart.findOne({
        cartId,
        status: { $in: ["active", "checkout"] },
      });

      logger.info(
        `🔍 Cart lookup by cartId "${cartId}":`,
        cart
          ? `found (userId=${cart.userId}, coupon=${JSON.stringify(
              cart.coupon
            )})`
          : "NOT FOUND"
      );

      if (cart) {
        if (isGuest) {
          // Guest: use cart if it has no owner or is already a guest cart
          if (!cart.userId) {
            logger.info(`✅ Guest using anonymous cart: ${cartId}`);
          } else {
            logger.info(`⚠️ Cart ${cartId} belongs to a user — guest cannot use it`);
            cart = null;
          }
        } else {
          // If cart exists but belongs to no user OR this user, claim/use it
          if (!cart.userId || cart.userId.toString() === userId.toString()) {
            if (!cart.userId) {
              logger.info(`🏷 Claiming cart ${cartId} for user ${userId}`);
              cart.userId = userId;
              await cart.save();
            }
            logger.info(`✅ Using cart from cartId: ${cartId}`);
          } else {
            // Cart belongs to different user - don't use it
            logger.info(
              `⚠️ Cart ${cartId} belongs to different user, will find user's own cart`
            );
            cart = null;
          }
        }
      }
    }

    // 2. If no cart found by cartId and user is authenticated, look for user's existing cart
    if (!cart && !isGuest) {
      cart = await Cart.findOne({
        userId,
        status: { $in: ["active", "checkout"] },
      });

      if (cart) {
        logger.info(`📦 Found user's existing cart: ${cart.cartId}`);
      }
    }

    // 3. If STILL not found, CREATE a new cart for the user (authenticated only)
    if (!cart && !isGuest) {
      logger.info(
        `🆕 Creating new cart for user ${userId} (No existing cart found)`
      );
      cart = await Cart.create({
        userId,
        cartId: generateCartId(),
        items: [],
        status: "active",
      });
    }

    if (!cart) {
      return res.status(404).json({
        success: false,
        errorCode: "CART_NOT_FOUND",
        message: "Cart not found. Please add items to your cart first.",
      });
    }

    // 3b. Reject checkout for empty cart
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        errorCode: "EMPTY_CART",
        message: "Cannot start checkout with an empty cart",
      });
    }

    // 4. Idempotency Check: If cart is already in valid checkout, return existing session
    if (cart.status === "checkout" && cart.checkoutExpiry > new Date()) {
      logger.info(
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

    logger.info(
      `🔒 Checkout started for user ${userId}, token: ${cart.checkoutToken}`
    );

    return res.status(200).json({
      success: true,
      message: "Checkout started successfully",
      checkoutToken: cart.checkoutToken,
      expiresAt: cart.checkoutExpiry,
    });
  } catch (error) {
    logger.error("❌ Checkout start error:", error);
    return res.status(500).json({
      success: false,
      errorCode: "INTERNAL_ERROR",
      message: "Failed to start checkout",
    });
  }
};

module.exports = startCheckout;
