// middleware/validateCart.js
const { CART_ID } = require("../../resources/constants");
const Cart = require("../models/Cart");
const { isValidCartId } = require("../utils/cartIdGenerator");

/**
 * Validate Cart Middleware
 *
 * Reads cartId from:
 * 1. x-cart-id header (preferred)
 * 2. cookie fallback (cart_id cookie)
 *
 * Validates cart existence and expiry.
 * If expired, responds with { expired: true } (200 status).
 * If not found, attaches null to req.cart (controller can create if needed).
 * If valid, attaches cart to req.cart.
 */
const validateCart = async (req, res, next) => {
  try {
    // Get cartId from header or cookie
    const cartIdFromHeader = req.headers["x-cart-id"];
    const cartIdFromCookie = req.cookies?.[CART_ID];
    let cartId = cartIdFromHeader || cartIdFromCookie;

    // If no cartId provided but user is logged in, try to restore their cart
    if (!cartId && req.user?.id) {
      const userCart = await Cart.findOne({
        userId: req.user.id,
        status: { $in: ["active", "checkout"] },
      });

      if (userCart) {
        // Restore cart by setting cookie
        res.cookie(CART_ID, userCart.cartId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });
        req.cart = userCart;
        req.cartId = userCart.cartId;
        return next();
      }
    }

    // If no cartId provided and no user cart found, let controller handle
    if (!cartId) {
      req.cart = null;
      req.cartId = null;
      return next();
    }

    // Validate cartId format
    if (!isValidCartId(cartId)) {
      req.cart = null;
      req.cartId = null;
      return next();
    }

    // Look up cart
    const cart = await Cart.findOne({ cartId });

    // Cart not found
    if (!cart) {
      req.cart = null;
      req.cartId = null;
      return next();
    }

    // If cart belongs to a user but the request is unauthenticated and the
    // cartId came only from the cookie (not the x-cart-id header), refuse it.
    // This handles the case where a user logs out but the HttpOnly cart_id
    // cookie persists — without this check the guest session would see the
    // previous user's cart.
    if (cart.userId && !req.user?.id && !cartIdFromHeader) {
      req.cart = null;
      req.cartId = null;
      res.clearCookie(CART_ID, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return next();
    }

    // Check if cart is already ordered
    if (cart.status === "ordered") {
      req.cart = null;
      req.cartId = null;
      // Clear cookie for ordered cart
      res.clearCookie(CART_ID, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      return next();
    }

    // Checking 'checkout' status:
    // Previously we hid the cart here, but that prevents reading items/summary during checkout.
    // Instead, we allow the cart to pass through, but modification controllers (addItem, etc.)
    // must check if status === 'active'.

    // Check expiry
    if (cart.expiresAt && new Date(cart.expiresAt) < new Date()) {
      // Cart expired - respond with expired flag
      return res.status(200).json({
        success: false,
        expired: true,
        message: "Cart has expired",
      });
    }

    // Valid cart - attach to request
    req.cart = cart;
    req.cartId = cartId;
    next();
  } catch (error) {
    console.error("❌ Error validating cart:", error);
    // On error, continue without cart (let controller handle)
    req.cart = null;
    req.cartId = null;
    next();
  }
};

module.exports = { validateCart };
