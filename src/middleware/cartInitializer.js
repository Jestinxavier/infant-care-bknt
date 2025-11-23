// middleware/cartInitializer.js
const Cart = require("../models/Cart");
const { generateCartId, isValidCartId } = require("../utils/cartIdGenerator");

/**
 * Cart Initializer Middleware
 *
 * This middleware:
 * 1. Checks for cart_id cookie
 * 2. If no cookie, generates new cartId, creates empty cart, sets cookie
 * 3. If cookie exists, validates it and attaches to req
 * 4. Optionally merges with user cart if user is authenticated
 *
 * Usage: app.use(cartInitializer)
 */
const cartInitializer = async (req, res, next) => {
  try {
    const cartIdFromCookie = req.cookies?.cart_id;
    const userId = req.user?.id || null; // From auth middleware if present

    let cartId = cartIdFromCookie;

    // Validate existing cart ID
    if (cartId && isValidCartId(cartId)) {
      // Check if cart exists
      const existingCart = await Cart.findOne({ cartId });
      if (!existingCart) {
        // Cart doesn't exist, generate new one
        cartId = null;
      } else if (userId && !existingCart.userId) {
        // User logged in but cart not assigned, assign it
        existingCart.userId = userId;
        await existingCart.save();
      }
    } else {
      // Invalid or missing cart ID
      cartId = null;
    }

    // Generate new cart if needed
    if (!cartId) {
      cartId = generateCartId();

      // Create empty cart
      await Cart.create({
        cartId,
        userId,
      });

      // Set secure HTTP-only cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        sameSite: "lax", // CSRF protection
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      };

      res.cookie("cart_id", cartId, cookieOptions);
    }

    // Attach cartId to request object
    req.cartId = cartId;

    next();
  } catch (err) {
    console.error("❌ Error in cart initializer:", err);
    // Don't block request, just continue without cart
    req.cartId = null;
    next();
  }
};

/**
 * Optional: Middleware to attach cart data to request
 * Use this if you need cart data in every request (may impact performance)
 */
const attachCartData = async (req, res, next) => {
  try {
    if (req.cartId) {
      const cart = await Cart.findOne({ cartId: req.cartId }).populate({
        path: "items.productId",
        select: "title url_key images",
      });

      if (cart) {
        req.cart = {
          cartId: cart.cartId,
          items: cart.items,
          subtotal: cart.subtotal,
          tax: cart.tax,
          shippingEstimate: cart.shippingEstimate,
          total: cart.total,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        };
      }
    }
    next();
  } catch (err) {
    console.error("❌ Error attaching cart data:", err);
    next();
  }
};

module.exports = {
  cartInitializer,
  attachCartData,
};
