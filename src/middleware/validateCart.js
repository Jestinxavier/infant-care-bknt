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
    const cartId = cartIdFromHeader || cartIdFromCookie;

    // If no cartId provided, let controller handle (may create new cart)
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

    // Check if cart is already ordered
    if (cart.status === "ordered") {
      req.cart = null;
      req.cartId = null;
      // Clear cookie for ordered cart
      res.clearCookie(CART_ID, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      return next();
    }

    // Check if cart is in checkout (pending payment)
    if (cart.status === "checkout") {
      // Hide cart from frontend to prevent modification, but KEEP cookie for recovery
      req.cart = null;
      req.cartId = null;
      return next();
    }

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
