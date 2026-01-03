// controllers/cart/hybridCartController.js
const { CART_ID, SHIPPING_COST } = require("../../../resources/constants");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const Coupon = require("../../models/Coupon");
const Order = require("../../models/Order");
const {
  isValidCartId,
  generateCartId,
} = require("../../utils/cartIdGenerator");
const { formatCartResponse } = require("../../utils/formatCartResponse");

const SiteSetting = require("../../models/SiteSetting");

/**
 * Get cart settings from DB
 */
const getCartSettings = async () => {
  const settings = await SiteSetting.find({ scope: "cart" });
  const config = {
    freeThreshold: SHIPPING_COST.FREE_THRESHOLD, // Default
    shippingCost: SHIPPING_COST.SHIPPING_COST, // Default
  };

  settings.forEach((s) => {
    if (s.key === "cart.shipping.freeThreshold")
      config.freeThreshold = Number(s.value);
    if (s.key === "cart.shipping.flat") config.shippingCost = Number(s.value);
  });

  return config;
};

/**
 * Calculate shipping estimate
 */
const calculateShipping = (subtotal, settings) => {
  return subtotal >= settings.freeThreshold ? 0 : settings.shippingCost;
};

/**
 * Calculate cart totals (subtotal, tax, shipping, total)
 */
const calculateTotals = async (items) => {
  console.log(
    "🔍 calculateTotals called with items:",
    JSON.stringify(items, null, 2)
  );

  // Calculate subtotal from REGULAR prices (before discount)
  const subtotal = items.reduce((sum, item) => {
    console.log(
      `  Item: ${item.titleSnapshot}, priceSnapshot: ${item.priceSnapshot}, quantity: ${item.quantity}`
    );
    return sum + item.priceSnapshot * item.quantity;
  }, 0);

  console.log("✅ Subtotal (from regular prices):", subtotal);

  // Calculate total using OFFER prices (after discount)
  const totalAfterDiscount = items.reduce((sum, item) => {
    const price = item.discountPriceSnapshot || item.priceSnapshot;
    return sum + price * item.quantity;
  }, 0);

  const settings = await getCartSettings();
  const shippingEstimate = calculateShipping(totalAfterDiscount, settings);

  // Note: logic is basic here; Cart model checks coupon discount on save
  const total = totalAfterDiscount + shippingEstimate;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: 0,
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
        // Safe Claim: If cart is unowned and user is logged in
        if (!existingCart.userId && userId) {
          // Check if user has another cart
          const otherCart = await Cart.findOne({
            userId,
            cartId: { $ne: cartId },
          });
          if (!otherCart) {
            existingCart.userId = userId;
            await existingCart.save();
          }
        }

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
 * HEAD /api/v1/cart/get (for validation)
 * Get full cart by cookie/cartId or validate cart existence
 */
const getCart = async (req, res) => {
  try {
    const cart = req.cart;

    // Handle HEAD request for lightweight cart validation
    if (req.method === "HEAD") {
      if (!cart) {
        return res.status(404).end();
      }
      return res.status(200).end();
    }

    // Handle POST request for full cart data
    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: null,
      });
    }

    // Recalculate totals to ensure they're up-to-date
    // Recalculate totals to ensure they're up-to-date
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    // Ensure product data is populated for the response
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

    const formatted = formatCartResponse(cart);

    console.log(
      "📤 Returning cart with subtotal:",
      formatted.subtotal,
      "total:",
      formatted.total
    );

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

    // Create cart if it doesn't exist (ATOMIC)
    let cartDoc = cart;
    if (!cartDoc) {
      const cartId = req.cartId || generateCartId();
      const userId = req.user?.id || null;

      // Atomic upsert: find or create cart in one operation
      cartDoc = await Cart.findOneAndUpdate(
        { cartId }, // Find by cartId
        {
          $setOnInsert: {
            userId,
            items: [],
            status: "active",
            subtotal: 0,
            tax: 0,
            shippingEstimate: 0,
            total: 0,
          },
        },
        { upsert: true, new: true } // Create if not exists, return new doc
      );

      // Set cookie if new cart was created
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
    } else {
      // Safe Claim: If cart is unowned and user is logged in
      const userId = req.user?.id;
      if (!cartDoc.userId && userId) {
        // Check if user has another cart
        const otherCart = await Cart.findOne({
          userId,
          cartId: { $ne: cartDoc.cartId },
        });
        if (!otherCart) {
          cartDoc.userId = userId;
          // save() happens later after adding item
        }
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
    // Recalculate totals
    const totals = await calculateTotals(cartDoc.items);
    cartDoc.subtotal = totals.subtotal;
    cartDoc.tax = totals.tax;
    cartDoc.shippingEstimate = totals.shippingEstimate;
    cartDoc.total = totals.total;
    cartDoc.total = totals.total;
    await cartDoc.save();

    // Ensure product data is populated for the response
    await cartDoc.populate({
      path: "items.productId",
      select: "title url_key images",
    });

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
    // Recalculate totals
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    // Ensure product data is populated for the response
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

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
    // Recalculate totals
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    await cart.save();

    // Ensure product data is populated for the response
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

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

    // Ensure product data is populated for the response
    await cart.populate({
      path: "items.productId",
      select: "title url_key images",
    });

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
      // Return empty summary structure
      return res.status(200).json({
        success: true,
        priceSummary: {
          currency: "INR",
          lines: [
            {
              key: "items_subtotal",
              label: "Subtotal",
              amount: 0,
              type: "base",
              order: 1,
            },
            {
              key: "shipping",
              label: "Shipping",
              amount: 0,
              type: "charge",
              estimated: true,
              order: 3,
            },
          ],
          payable: {
            label: "Total Payable",
            amount: 0,
          },
        },
      });
    }

    // Ensure product data is populated for the response (needed for price calculation)
    // Assuming cart is already populated by middleware or we do it here
    if (!cart.items[0]?.productId?.title) {
      await cart.populate({
        path: "items.productId",
        select: "title url_key images",
      });
    }

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      priceSummary: formatted.priceSummary,
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
            currency: "INR",
            lines: [
              {
                key: "items_subtotal",
                label: "Subtotal",
                amount: 0,
                type: "base",
                order: 1,
              },
              {
                key: "shipping",
                label: "Shipping",
                amount: 0,
                type: "charge",
                estimated: true,
                order: 3,
              },
            ],
            payable: {
              label: "Total Payable",
              amount: 0,
            },
          },
        },
      });
    }

    // Ensure product data is populated for the response
    if (!cart.items[0]?.productId?.title) {
      await cart.populate({
        path: "items.productId",
        select: "title url_key images",
      });
    }

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      summary: {
        count: formatted.itemCount,
        priceSummary: formatted.priceSummary,
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
/**
 * POST /api/v1/cart/merge
 * Merge guest cart into user cart on login
 * Logic:
 * 1. If User has existing cart -> Merge Guest items into User Cart -> Delete Guest Cart
 * 2. If User has NO existing cart -> Assign Guest Cart to User
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

    if (!guestCart) {
      return res.status(200).json({
        success: true,
        message: "No guest cart to merge",
        cart: null,
      });
    }

    // Check if the cart is already assigned to a user
    if (guestCart.userId) {
      if (guestCart.userId.toString() === userId.toString()) {
        const formatted = formatCartResponse(guestCart);
        return res.status(200).json({
          success: true,
          cart: formatted,
          message: "Cart already assigned to user",
        });
      } else {
        return res.status(200).json({
          success: true,
          message: "Cart belongs to another user - cannot merge",
          cart: null,
        });
      }
    }

    // Check if user already has an existing cart (excluding the current guest cart)
    const userCart = await Cart.findOne({
      userId,
      cartId: { $ne: guestCart.cartId },
    });

    if (userCart) {
      // SCENARIO 1: User has an existing cart -> MERGE
      console.log(
        `🔄 Merging guest cart ${guestCart.cartId} into user cart ${userCart.cartId}`
      );

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

      // Recalculate totals for user cart
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

      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart merged successfully",
      });
    } else {
      // SCENARIO 2: User has NO existing cart -> ASSIGN
      console.log(
        `👤 Assigning guest cart ${guestCart.cartId} to user ${userId}`
      );

      guestCart.userId = userId;
      // Totals remain the same, just saving the association
      await guestCart.save();

      // Cookie remains valid (points to the same cartId)

      const formatted = formatCartResponse(guestCart);

      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart assigned to user successfully",
      });
    }
  } catch (error) {
    console.error("❌ Error merging cart:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/cart/apply-coupon
 * Apply coupon to cart
 */
const applyCoupon = async (req, res) => {
  try {
    const cart = req.cart;
    const { code } = req.body;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    // Validate coupon
    if (!coupon.isActive) {
      return res.status(400).json({
        success: false,
        message: "Coupon is inactive",
      });
    }

    const now = new Date();
    if (new Date(coupon.startDate) > now || new Date(coupon.endDate) < now) {
      return res.status(400).json({
        success: false,
        message: "Coupon is expired or not yet active",
      });
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "Coupon usage limit reached",
      });
    }

    // Check for first order only
    if (coupon.isNewUserOnly) {
      // Must be logged in
      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Please login to use this new user coupon",
        });
      }

      // Check if user has any previous orders
      // We count orders that are NOT cancelled
      const previousOrders = await Order.countDocuments({
        userId,
        orderStatus: { $ne: "cancelled" },
      });

      if (previousOrders > 0) {
        return res.status(400).json({
          success: false,
          message: "This coupon is valid for your first order only",
        });
      }
    }

    // Calculate cart value for minimum requirement
    // Use subtotal or totalAfterDiscount (items only)
    const totals = calculateTotals(cart.items);
    // Assuming minCartValue applies to the item total after item discounts
    // Calculate total from items only (excluding shipping) for validation
    const cartItemTotal = cart.items.reduce((sum, item) => {
      const price = item.discountPriceSnapshot || item.priceSnapshot;
      return sum + price * item.quantity;
    }, 0);

    if (cartItemTotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum cart value of ₹${coupon.minCartValue} required`,
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === "flat") {
      discountAmount = coupon.value;
    } else if (coupon.type === "percentage") {
      discountAmount = (cartItemTotal * coupon.value) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    }

    // Apply coupon to cart
    cart.coupon = {
      code: coupon.code,
      couponId: coupon._id,
      discountAmount: discountAmount,
    };

    // Update totals with new discount
    // The pre-save hook in Cart model will apply this discountAmount to the total
    // But we need to make sure the hook logic aligns or we set it here.
    // The hook: if (this.coupon && this.coupon.discountAmount > 0) totalAfterDiscount -= ...
    // So setting it here is correct.

    // We also need to update other totals
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;

    await cart.save();

    const formatted = formatCartResponse(cart);

    res.status(200).json({
      success: true,
      cart: formatted,
      message: "Coupon applied successfully",
    });
  } catch (error) {
    console.error("❌ Error applying coupon:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/cart/remove-coupon
 * Remove coupon from cart
 */
const removeCoupon = async (req, res) => {
  try {
    const cart = req.cart;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.coupon = undefined;

    // Recalculate totals (without coupon)
    const totals = calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = 0;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;

    await cart.save();

    // Return lightweight response (no items, no tax)
    const cartResponse = {
      cartId: cart.cartId,
      userId: cart.userId,
      subtotal: cart.subtotal,
      shippingEstimate: cart.shippingEstimate,
      total: cart.total,
      itemCount: cart.items.length,
      coupon: null,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };

    res.status(200).json({
      success: true,
      cart: cartResponse,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    console.error("❌ Error removing coupon:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/cart/coupons
 * Get list of available coupons
 */
const getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();

    const coupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    })
      .select("code type value minCartValue maxDiscount endDate")
      .sort({ endDate: 1 });

    const formattedCoupons = coupons.map((coupon) => ({
      code: coupon.code,
      description:
        coupon.type === "flat"
          ? `Flat ₹${coupon.value} off`
          : `${coupon.value}% off${
              coupon.maxDiscount ? ` up to ₹${coupon.maxDiscount}` : ""
            }`,
      minCartValue: coupon.minCartValue,
      expiresAt: coupon.endDate,
    }));

    res.status(200).json({
      success: true,
      coupons: formattedCoupons,
    });
  } catch (error) {
    console.error("❌ Error getting coupons:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  createCart,
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
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
};
