// controllers/cart/hybridCartController.js
const { CART_ID } = require("../../../resources/constants");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const {
  isValidCartId,
  generateCartId,
} = require("../../utils/cartIdGenerator");
const { formatCartResponse } = require("../../utils/formatCartResponse");

/**
 * Calculate shipping estimate
 * Free shipping if cart total >= 1000, otherwise 60
 */
const calculateShipping = (subtotal) => {
  return subtotal >= 1000 ? 0 : 60;
};

/**
 * Calculate cart totals (subtotal, tax, shipping, total)
 */
const calculateTotals = (items) => {
  console.log('🔍 calculateTotals called with items:', JSON.stringify(items, null, 2));

  // Calculate subtotal from REGULAR prices (before discount)
  const subtotal = items.reduce((sum, item) => {
    console.log(`  Item: ${item.titleSnapshot}, priceSnapshot: ${item.priceSnapshot}, quantity: ${item.quantity}`);
    return sum + item.priceSnapshot * item.quantity;
  }, 0);

  console.log('✅ Subtotal (from regular prices):', subtotal);

  // Calculate total using OFFER prices (after discount)
  const totalAfterDiscount = items.reduce((sum, item) => {
    const price = item.discountPriceSnapshot || item.priceSnapshot;
    console.log(`  Item: ${item.titleSnapshot}, offer price: ${price}, quantity: ${item.quantity}`);
    return sum + price * item.quantity;
  }, 0);

  console.log('✅ Total after discount:', totalAfterDiscount);

  const shippingEstimate = calculateShipping(totalAfterDiscount);
  const total = totalAfterDiscount + shippingEstimate;

  console.log('✅ Shipping:', shippingEstimate);
  console.log('✅ Final total:', total);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: 0, // No tax for now
    shippingEstimate: Math.round(shippingEstimate * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
};

/**
 * Get product data for cart item
 * Returns variant data if variantId exists, otherwise product data
 */
const getProductDataForCart = async (productId, variantId = null) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  // If no variantId, return product data
  if (!variantId) {
    return {
      id: product._id.toString(),
      title: product.title,
      image: product.images?.[0] || "",
      price: product.pricing?.price || product.price || 0,
      discountPrice:
        product.pricing?.discountPrice || product.discountPrice || null,
      stockObj: product.stockObj || {
        available: product.stock || 0,
        isInStock: (product.stock || 0) > 0,
      },
    };
  }

  // Find variant in product.variants array
  const variant = product.variants?.find((v) => v.id === variantId);
  if (!variant) {
    throw new Error("Variant not found");
  }

  return {
    id: variant.id,
    title: product.title, // Use product title
    image: variant.images?.[0] || product.images?.[0] || "",
    price: variant.pricing?.price || variant.price || 0,
    discountPrice:
      variant.pricing?.discountPrice || variant.discountPrice || null,
    stockObj: variant.stockObj || {
      available: variant.stock || 0,
      isInStock: (variant.stock || 0) > 0,
    },
  };
};

/**
 * POST /api/v1/cart/create
 * Create cart server-side (optional)
 */
const createCart = async (req, res) => {
  try {
    const { cartId } = req.body;
    const userId = req.user?.id || null;

    // Validate cartId format if provided
    if (cartId && !isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    // Check if cart already exists
    if (cartId) {
      const existingCart = await Cart.findOne({ cartId });
      if (existingCart) {
        const formatted = formatCartResponse(existingCart);
        return res.status(200).json({
          success: true,
          cart: formatted,
        });
      }
    }

    // Generate new cartId if not provided
    const newCartId = cartId || generateCartId();

    // Create cart
    const cart = await Cart.create({
      cartId: newCartId,
      userId,
    });

    // Set HTTP-only cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    };
    res.cookie(CART_ID, newCartId, cookieOptions);

    const formatted = formatCartResponse(cart);

    res.status(201).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error creating cart:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/set-cookie
 * Set HTTP-only cookie for client-generated cartId
 */
const setCookie = async (req, res) => {
  try {
    const { cartId } = req.body;

    if (!cartId || !isValidCartId(cartId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart ID format",
      });
    }

    // Create cart if it doesn't exist
    let cart = await Cart.findOne({ cartId });
    if (!cart) {
      const userId = req.user?.id || null;
      cart = await Cart.create({
        cartId,
        userId,
      });
    }

    // Set HTTP-only cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    };
    res.cookie(CART_ID, cartId, cookieOptions);

    res.status(200).json({
      success: true,
      message: "Cookie set successfully",
    });
  } catch (error) {
    console.error("❌ Error setting cookie:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/get
 * Get full cart by cookie/cartId
 */
const getCart = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: null,
      });
    }

    // Recalculate totals to ensure they're up-to-date
    const totals = calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    const formatted = formatCartResponse(cart);

    console.log('📤 Returning cart with subtotal:', formatted.subtotal, 'total:', formatted.total);

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error getting cart:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/add-item
 * Add item to cart
 */
const addItem = async (req, res) => {
  try {
    const cart = req.cart;
    const { item } = req.body;

    if (!item || !item.productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Create cart if it doesn't exist
    let cartDoc = cart;
    if (!cartDoc) {
      const cartId = req.cartId || generateCartId();
      const userId = req.user?.id || null;
      cartDoc = await Cart.create({ cartId, userId });

      // Set cookie if new cart
      if (!req.cartId) {
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        };
        res.cookie(CART_ID, cartId, cookieOptions);
      }
    }

    // Get product data
    const productData = await getProductDataForCart(
      item.productId,
      item.variantId || null
    );

    // Prepare item data with snapshots
    const itemData = {
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: item.quantity || 1,
      priceSnapshot: productData.price,
      discountPriceSnapshot: productData.discountPrice || null,
      titleSnapshot: productData.title,
      imageSnapshot: productData.image,
      skuSnapshot: item.sku || null,
      attributesSnapshot: item.attributes || null,
    };

    // Add item to cart
    await cartDoc.addItem(itemData);

    // Recalculate totals
    const totals = calculateTotals(cartDoc.items);
    cartDoc.subtotal = totals.subtotal;
    cartDoc.tax = totals.tax;
    cartDoc.shippingEstimate = totals.shippingEstimate;
    cartDoc.total = totals.total;
    await cartDoc.save();

    const formatted = formatCartResponse(cartDoc);

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error adding item:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/v1/cart/update-item
 * Update item quantity
 */
const updateItem = async (req, res) => {
  try {
    const cart = req.cart;
    const { itemId, changes } = req.body;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    const { quantity } = changes || {};

    if (quantity !== undefined) {
      if (quantity <= 0) {
        // Remove item
        cart.items.pull(itemId);
      } else {
        // Update quantity
        const item = cart.items.id(itemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: "Item not found in cart",
          });
        }
        item.quantity = quantity;
      }
    }

    // Recalculate totals
    const totals = calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error updating item:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/cart/remove-item
 * Remove item from cart
 */
const removeItem = async (req, res) => {
  try {
    const cart = req.cart;
    const { itemId } = req.body;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required",
      });
    }

    cart.items.pull(itemId);

    // Recalculate totals
    const totals = calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error removing item:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/clear
 * Clear all items from cart
 */
const clearCart = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    cart.subtotal = 0;
    cart.tax = 0;
    cart.shippingEstimate = 0;
    cart.total = 0;
    await cart.save();

    const formatted = formatCartResponse(cart);

    // Clear cookie also
    res.clearCookie(CART_ID);

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    console.error("❌ Error clearing cart:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/count
 * Get total item count
 */
const getCount = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(200).json({
        success: true,
        count: 0,
      });
    }

    const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("❌ Error getting count:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/items
 * Get list of cart items
 */
const getItems = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(200).json({
        success: true,
        items: [],
      });
    }

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      items: formatted.items || [],
    });
  } catch (error) {
    console.error("❌ Error getting items:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/price-summary
 * Get price summary
 */
const getPriceSummary = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(200).json({
        success: true,
        priceSummary: {
          subtotal: 0,
          tax: 0,
          shippingEstimate: 0,
          total: 0,
        },
      });
    }

    const totals = calculateTotals(cart.items);

    res.status(200).json({
      success: true,
      priceSummary: totals,
    });
  } catch (error) {
    console.error("❌ Error getting price summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/product-data
 * Get detailed product data for items
 */
const getProductData = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(200).json({
        success: true,
        productData: [],
      });
    }

    // Populate product details
    await cart.populate({
      path: "items.productId",
      select: "title url_key images pricing stockObj variants",
    });

    const productData = cart.items.map((item) => {
      const product = item.productId;
      let variantData = null;

      // If variantId exists, get variant data
      if (item.variantId && product.variants) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (variant) {
          variantData = {
            id: variant.id,
            image: variant.images?.[0] || product.images?.[0] || "",
            price: variant.pricing?.price || variant.price || 0,
            discountPrice:
              variant.pricing?.discountPrice || variant.discountPrice || null,
            stockObj: variant.stockObj || {
              available: variant.stock || 0,
              isInStock: (variant.stock || 0) > 0,
            },
          };
        }
      }

      return {
        itemId: item._id.toString(),
        productId: product._id.toString(),
        variantId: item.variantId || null,
        product: {
          _id: product._id.toString(),
          title: product.title,
          url_key: product.url_key,
          images: product.images || [],
        },
        variant: variantData,
      };
    });

    res.status(200).json({
      success: true,
      productData,
    });
  } catch (error) {
    console.error("❌ Error getting product data:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/summary
 * Combined summary: count + price-summary
 */
const getSummary = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(200).json({
        success: true,
        summary: {
          count: 0,
          priceSummary: {
            subtotal: 0,
            tax: 0,
            shippingEstimate: 0,
            total: 0,
          },
        },
      });
    }

    const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const totals = calculateTotals(cart.items);

    res.status(200).json({
      success: true,
      summary: {
        count,
        priceSummary: totals,
      },
    });
  } catch (error) {
    console.error("❌ Error getting summary:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/merge
 * Merge guest cart into user cart on login
 */
const mergeCart = async (req, res) => {
  try {
    const guestCart = req.cart;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User must be authenticated",
      });
    }

    if (!guestCart || guestCart.items.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No items to merge",
        cart: null,
      });
    }

    // Find or create user cart
    let userCart = await Cart.findOne({
      userId,
      cartId: { $ne: guestCart.cartId },
    });

    if (!userCart) {
      // Create new user cart
      const newCartId = generateCartId();
      userCart = await Cart.create({
        cartId: newCartId,
        userId,
      });
    }

    // Merge items from guest cart
    for (const guestItem of guestCart.items) {
      await userCart.addItem({
        productId: guestItem.productId,
        variantId: guestItem.variantId,
        quantity: guestItem.quantity,
        priceSnapshot: guestItem.priceSnapshot,
        discountPriceSnapshot: guestItem.discountPriceSnapshot,
        titleSnapshot: guestItem.titleSnapshot,
        imageSnapshot: guestItem.imageSnapshot,
        skuSnapshot: guestItem.skuSnapshot,
        attributesSnapshot: guestItem.attributesSnapshot,
      });
    }

    // Recalculate totals
    const totals = calculateTotals(userCart.items);
    userCart.subtotal = totals.subtotal;
    userCart.tax = totals.tax;
    userCart.shippingEstimate = totals.shippingEstimate;
    userCart.total = totals.total;
    await userCart.save();

    // Delete guest cart
    await Cart.deleteOne({ cartId: guestCart.cartId });

    // Update cookie to user cart
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    };
    res.cookie(CART_ID, userCart.cartId, cookieOptions);

    const formatted = formatCartResponse(userCart);

    res.status(200).json({
      success: true,
      cart: formatted,
      message: "Cart merged successfully",
    });
  } catch (error) {
    console.error("❌ Error merging cart:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createCart,
  setCookie,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  getCount,
  getItems,
  getPriceSummary,
  getProductData,
  getSummary,
  mergeCart,
};
