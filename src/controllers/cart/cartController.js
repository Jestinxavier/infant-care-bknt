// controllers/cart/cartController.js
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const {
  generateCartId,
  isValidCartId,
} = require("../../utils/cartIdGenerator");
const { formatCartResponse } = require("../../utils/formatCartResponse");

/**
 * Create or get cart
 * If cartId provided and valid, return existing cart
 * Otherwise, create new cart
 */
const createOrGetCart = async (req, res) => {
  try {
    const { cartId } = req.body;
    const userId = req.user?.id || null; // From auth middleware if present

    let cart;

    if (cartId && isValidCartId(cartId)) {
      // Try to find existing cart
      cart = await Cart.findOne({ cartId });

      // If cart found and user is logged in, update userId
      if (cart && userId && !cart.userId) {
        cart.userId = userId;
        await cart.save();
      }
    }

    // Create new cart if not found
    if (!cart) {
      const newCartId = generateCartId();
      cart = await Cart.create({
        cartId: newCartId,
        userId,
      });

      // Set secure HTTP-only cookie for new cart
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      };
      res.cookie("cart_id", newCartId, cookieOptions);
    }

    // Populate product details for items
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed, only cartId
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error creating/getting cart:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get cart by cartId
 */
const getCart = async (req, res) => {
  try {
    const { cartId } = req.params;

    if (!isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    const cart = await Cart.findOne({ cartId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Populate product details
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error fetching cart:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Add item to cart
 */
const addItemToCart = async (req, res) => {
  try {
    const { cartId } = req.params;
    const { productId, variantId, quantity = 1 } = req.body;

    if (!isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    if (quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ cartId });
    if (!cart) {
      cart = await Cart.create({ cartId, userId: req.user?.id || null });
    }

    // Fetch product to get current data
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Determine variant data if variantId provided
    let variant = null;
    let priceSnapshot = product.pricing?.price || product.basePrice || 0;
    let discountPriceSnapshot = product.pricing?.discountPrice || null;
    let imageSnapshot = product.images?.[0] || "";
    let skuSnapshot = null;
    let attributesSnapshot = null;

    if (variantId && product.variants && product.variants.length > 0) {
      variant = product.variants.find((v) => v.id === variantId);
      if (!variant) {
        return res.status(404).json({
          success: false,
          message: "Variant not found",
        });
      }

      // Use variant pricing and images
      priceSnapshot = variant.pricing?.price || variant.price || priceSnapshot;
      discountPriceSnapshot =
        variant.pricing?.discountPrice || variant.discountPrice || null;
      imageSnapshot =
        variant.images?.[0] || product.images?.[0] || imageSnapshot;
      skuSnapshot = variant.sku || null;

      // Convert variant attributes to Map
      if (variant.attributes) {
        const attrs =
          variant.attributes instanceof Map
            ? variant.attributes
            : new Map(Object.entries(variant.attributes));
        attributesSnapshot = attrs;
      }

      // Check stock availability
      const stock =
        variant.stockObj?.available !== undefined
          ? variant.stockObj.available
          : variant.stock || 0;
      const isInStock =
        variant.stockObj?.isInStock !== undefined
          ? variant.stockObj.isInStock
          : stock > 0;

      if (!isInStock) {
        return res.status(400).json({
          success: false,
          message: "Variant is out of stock",
        });
      }

      // Check if requested quantity exceeds stock
      const existingItem = cart.items.find(
        (item) =>
          item.productId.toString() === productId &&
          item.variantId === variantId
      );
      const currentQuantity = existingItem ? existingItem.quantity : 0;
      if (currentQuantity + quantity > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} items available. You already have ${currentQuantity} in cart.`,
        });
      }
    } else {
      // Product without variant - check parent stock
      const stock =
        product.stockObj?.available !== undefined
          ? product.stockObj.available
          : 0;
      const isInStock =
        product.stockObj?.isInStock !== undefined
          ? product.stockObj.isInStock
          : stock > 0;

      if (!isInStock) {
        return res.status(400).json({
          success: false,
          message: "Product is out of stock",
        });
      }

      const existingItem = cart.items.find(
        (item) => item.productId.toString() === productId && !item.variantId
      );
      const currentQuantity = existingItem ? existingItem.quantity : 0;
      if (currentQuantity + quantity > stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${stock} items available. You already have ${currentQuantity} in cart.`,
        });
      }
    }

    // Add item to cart
    await cart.addItem({
      productId,
      variantId: variantId || null,
      quantity,
      priceSnapshot,
      discountPriceSnapshot,
      titleSnapshot: product.title || product.name,
      imageSnapshot,
      skuSnapshot,
      attributesSnapshot,
    });

    // Reload cart with populated data
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      message: "Item added to cart",
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error adding item to cart:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Update item quantity
 */
const updateItemQuantity = async (req, res) => {
  try {
    const { cartId, itemId } = req.params;
    const { quantity } = req.body;

    if (!isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    if (quantity !== undefined && quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity cannot be negative",
      });
    }

    const cart = await Cart.findOne({ cartId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Update quantity (method handles removal if quantity is 0)
    await cart.updateItemQuantity(itemId, quantity);

    // Reload cart with populated data
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      message: "Item quantity updated",
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error updating item quantity:", err);
    if (err.message === "Item not found in cart") {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Remove item from cart
 */
const removeItemFromCart = async (req, res) => {
  try {
    const { cartId, itemId } = req.params;

    if (!isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    const cart = await Cart.findOne({ cartId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    await cart.removeItem(itemId);

    // Reload cart with populated data
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error removing item from cart:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Clear cart (remove all items)
 */
const clearCart = async (req, res) => {
  try {
    const { cartId } = req.params;

    if (!isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    const cart = await Cart.findOne({ cartId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    await cart.clearItems();

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      message: "Cart cleared",
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error clearing cart:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Merge guest cart into user cart
 * This is called after user login
 */
const mergeGuestCart = async (req, res) => {
  try {
    const { guestCartId, userCartId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User must be authenticated",
      });
    }

    if (!isValidCartId(guestCartId) || !isValidCartId(userCartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    // Find both carts
    const guestCart = await Cart.findOne({ cartId: guestCartId });
    const userCart = await Cart.findOne({ cartId: userCartId });

    if (!guestCart) {
      return res.status(404).json({
        success: false,
        message: "Guest cart not found",
      });
    }

    if (!userCart) {
      return res.status(404).json({
        success: false,
        message: "User cart not found",
      });
    }

    // Verify userCart belongs to the authenticated user
    if (userCart.userId?.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "User cart does not belong to authenticated user",
      });
    }

    // Merge items from guest cart into user cart
    // If same product+variant exists, combine quantities
    for (const guestItem of guestCart.items) {
      const existingItem = userCart.items.find(
        (item) =>
          item.productId.toString() === guestItem.productId.toString() &&
          item.variantId === guestItem.variantId
      );

      if (existingItem) {
        // Combine quantities
        existingItem.quantity += guestItem.quantity;
      } else {
        // Add new item
        userCart.items.push(guestItem);
      }
    }

    // Save merged cart
    await userCart.save();

    // Delete guest cart
    await Cart.deleteOne({ cartId: guestCartId });

    // Reload cart with populated data
    await userCart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    // Format response - ensure MongoDB _id is never exposed
    const formattedCart = formatCartResponse(userCart);

    res.status(200).json({
      success: true,
      message: "Carts merged successfully",
      cart: formattedCart,
    });
  } catch (err) {
    console.error("❌ Error merging carts:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  createOrGetCart,
  getCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearCart,
  mergeGuestCart,
};
