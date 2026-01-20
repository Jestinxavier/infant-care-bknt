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
const bundleService = require("../../features/product/bundle.service");
const { PRODUCT_TYPES } = require("../../features/product/product.model");

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
 * Calculate cart totals with dynamic pricing
 * Fetches products and computes prices at runtime using quantity pricing resolver
 *
 * @param {Array} items - Cart items (must have productId populated or as ObjectId)
 * @returns {{ subtotal, tax, shippingEstimate, total, itemPrices: Map }}
 */
const calculateTotals = async (items) => {
  const {
    computeCartItemPricing,
  } = require("../../utils/quantityPricingUtils");

  let subtotal = 0; // Sum of basePrice * quantity (for display)
  let totalAfterDiscount = 0; // Sum of unitPrice * quantity (actual total)
  const itemPrices = new Map(); // Map itemId -> pricing info

  for (const item of items) {
    // Get product ID
    const productId = item.productId?._id || item.productId;

    // Always fetch product directly for pricing fields (populate may not return quantityRules)
    const product = await Product.findById(productId)
      .select(
        "price offerPrice offerStartAt offerEndAt quantityRules variants product_type",
      )
      .lean();

    if (!product) continue;

    // Find variant if applicable
    let variant = null;
    if (item.variantId && product.variants) {
      variant = product.variants.find((v) => v.id === item.variantId);
    }

    // Compute pricing using the resolver
    const pricing = computeCartItemPricing(product, variant, item.quantity);

    // Store for later use in formatCartResponse
    const itemId = item._id ? item._id.toString() : productId.toString();
    itemPrices.set(itemId, pricing);

    // Accumulate totals
    subtotal += pricing.basePrice * item.quantity;
    totalAfterDiscount += pricing.lineTotal;
  }

  const settings = await getCartSettings();
  const shippingEstimate = calculateShipping(totalAfterDiscount, settings);

  const total = totalAfterDiscount + shippingEstimate;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: 0,
    shippingEstimate: Math.round(shippingEstimate * 100) / 100,
    total: Math.round(total * 100) / 100,
    itemPrices, // Map of item pricing for formatCartResponse
  };
};

/**
 * Recompute and assign cart totals
 * Returns itemPrices map for use in formatCartResponse
 */
const recomputeCartTotals = async (cart) => {
  const result = await calculateTotals(cart.items);
  cart.subtotal = result.subtotal;
  cart.tax = result.tax;
  cart.shippingEstimate = result.shippingEstimate;
  cart.total = result.total;
  return result.itemPrices;
};

/**
 * Get product data for cart item
 * Returns variant data if variantId exists, otherwise product data
 * For BUNDLE products, stock is computed dynamically from child SKUs
 */
const getProductDataForCart = async (productId, variantId = null) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found");
  }

  // Handle BUNDLE products - compute stock from children
  if (product.product_type === PRODUCT_TYPES.BUNDLE) {
    const bundleAvailability = await bundleService.getBundleAvailability(
      product.bundle_config,
    );
    return {
      id: product._id.toString(),
      title: product.title,
      image: product.images?.[0] || "",
      price: product.pricing?.price || product.price || 0,
      discountPrice:
        product.pricing?.discountPrice || product.discountPrice || null,
      stockObj: {
        available: bundleAvailability.availableQty,
        isInStock: bundleAvailability.isInStock,
      },
      isBundle: true,
    };
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
 * Get bundle availability with request-scoped caching
 * First call computes, subsequent calls return cached result
 *
 * @param {Object} req - Express request object
 * @param {Object} product - Product document (must have _id and bundle_config)
 * @returns {Object} { isInStock: boolean, availableQty: number }
 */
const getCachedBundleAvailability = async (req, product) => {
  // Initialize cache on first use
  if (!req.bundleAvailabilityCache) {
    req.bundleAvailabilityCache = new Map();
  }

  const key = product._id.toString();

  // Return cached if exists
  if (req.bundleAvailabilityCache.has(key)) {
    return req.bundleAvailabilityCache.get(key);
  }

  // Compute and cache
  const availability = await bundleService.getBundleAvailability(
    product.bundle_config,
  );
  req.bundleAvailabilityCache.set(key, availability);

  return availability;
};

/**
 * Compute bundle stocks and validation issues for all BUNDLE items in cart
 * Uses request-scoped cache to avoid N+1 DB calls
 *
 * IMPORTANT: Cart MUST be populated with items.productId before calling this.
 * This avoids redundant DB queries.
 *
 * @param {Object} req - Express request object (for caching)
 * @param {Object} cart - Cart document with POPULATED items.productId
 * @returns {{ bundleStocks: Map, issues: Array }}
 */
const computeBundleStocksAndIssues = async (req, cart) => {
  const bundleStocks = new Map();
  const issues = [];

  if (!cart || !cart.items) {
    return { bundleStocks, issues };
  }

  for (const item of cart.items) {
    const productDoc = item.productId;

    // Fail fast if not populated - caller must populate first
    if (!productDoc || !productDoc._id) {
      console.error(
        "❌ computeBundleStocksAndIssues: Cart items must be populated with productId",
      );
      continue; // Skip unpopulated items
    }

    if (productDoc.product_type === PRODUCT_TYPES.BUNDLE) {
      // Use cached availability
      const availability = await getCachedBundleAvailability(req, productDoc);
      const productId = productDoc._id.toString();

      // Store stock for formatCartResponse
      bundleStocks.set(productId, availability.availableQty);

      // Compute validation issues
      if (!availability.isInStock) {
        issues.push({
          productId,
          sku: productDoc.sku,
          title: productDoc.title,
          reason: "OUT_OF_STOCK",
          message: "This bundle is currently unavailable",
        });
      } else if (availability.availableQty < item.quantity) {
        issues.push({
          productId,
          sku: productDoc.sku,
          title: productDoc.title,
          reason: "INSUFFICIENT_STOCK",
          availableQty: availability.availableQty,
          requestedQty: item.quantity,
          message: `Only ${availability.availableQty} bundles available, you have ${item.quantity} in cart`,
        });
      }
    }
  }

  return { bundleStocks, issues };
};

/**
 * Compute bundle stocks only (for endpoints that don't need validation)
 * Uses request-scoped cache
 */
const computeBundleStocks = async (req, cart) => {
  const { bundleStocks } = await computeBundleStocksAndIssues(req, cart);
  return bundleStocks;
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

        // Populate and compute pricing for existing cart
        if (existingCart.items.length > 0) {
          await existingCart.populate({
            path: "items.productId",
            select:
              "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
          });
          const totals = await calculateTotals(existingCart.items);
          const itemPrices = totals.itemPrices;
          const bundleStocks = await computeBundleStocks(req, existingCart);
          const formatted = formatCartResponse(
            existingCart,
            bundleStocks,
            itemPrices,
          );
          return res.status(200).json({
            success: true,
            cart: formatted,
          });
        }

        // No items - empty cart
        const formatted = formatCartResponse(existingCart, null, null);
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

    // New cart has no items
    const formatted = formatCartResponse(cart, null, null);

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

    // Ensure product data is populated for the response (needed for pricing)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Recalculate totals dynamically (returns itemPrices for formatCartResponse)
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    const itemPrices = totals.itemPrices;

    await cart.save();

    // Compute bundle stocks AND validation issues in ONE pass (no N+1)
    const { bundleStocks, issues } = await computeBundleStocksAndIssues(
      req,
      cart,
    );

    // Pass bundleStocks and itemPrices so formatCartResponse has all pricing data
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

    // Cart validation result per bundle spec:
    // isValid: false blocks checkout, issues array explains why
    const isValid = issues.length === 0;

    res.status(200).json({
      success: true,
      cart: formatted,
      isValid,
      issues: issues.length > 0 ? issues : undefined,
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
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }
    const { item } = req.body;

    if (!item || !item.productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // CHOICE_GROUP products are NOT sellable - they reference bundle products
    // Customer must select a specific bundle on PDP before adding to cart
    const productCheck = await Product.findById(item.productId).select(
      "product_type",
    );
    if (productCheck?.product_type === PRODUCT_TYPES.CHOICE_GROUP) {
      return res.status(400).json({
        success: false,
        errorCode: "CHOICE_GROUP_NOT_SELLABLE",
        message: "Please select a gift option before adding to cart",
      });
    }

    // Create cart if it doesn't exist
    let cartDoc = cart;
    if (!cartDoc) {
      const userId = req.user?.id || null;

      // For logged-in users: FIRST check for existing cart in DB
      if (userId) {
        const existingUserCart = await Cart.findOne({
          userId,
          status: { $in: ["active", "checkout"] },
        });
        if (existingUserCart) {
          // Restore user's existing cart
          cartDoc = existingUserCart;
          res.cookie(CART_ID, existingUserCart.cartId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: "/",
          });
        }
      }

      // If still no cart (guest OR user with no existing cart), create new
      if (!cartDoc) {
        const cartId = generateCartId();
        cartDoc = await Cart.create({
          cartId,
          userId,
          items: [],
          status: "active",
          subtotal: 0,
          tax: 0,
          shippingEstimate: 0,
          total: 0,
        });
        res.cookie(CART_ID, cartId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });
      }
    }

    // Get product data
    const productData = await getProductDataForCart(
      item.productId,
      item.variantId || null,
    );

    const requestedQty = item.quantity || 1;

    // Validate stock availability (applies to all product types including bundles)
    if (productData.stockObj.available < requestedQty) {
      const errorType = productData.isBundle
        ? "BUNDLE_INSUFFICIENT_STOCK"
        : "INSUFFICIENT_STOCK";
      return res.status(400).json({
        success: false,
        errorCode: errorType,
        message: productData.isBundle
          ? `Only ${productData.stockObj.available} bundles available`
          : `Only ${productData.stockObj.available} items in stock`,
        availableQty: productData.stockObj.available,
        requestedQty,
      });
    }

    // Prepare item data (no price snapshots - prices computed dynamically)
    const itemData = {
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: requestedQty,
      titleSnapshot: productData.title,
      imageSnapshot: productData.image,
      skuSnapshot: item.sku || null,
      attributesSnapshot: item.attributes || null,
    };

    // Add item to cart
    await cartDoc.addItem(itemData);

    // Recalculate totals dynamically (returns itemPrices for formatCartResponse)
    const itemPrices = await recomputeCartTotals(cartDoc);
    await cartDoc.save();

    // Ensure product data is populated for the response
    await cartDoc.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Get bundle stocks for bundle products
    const bundleStocks = await computeBundleStocks(req, cartDoc);
    const formatted = formatCartResponse(cartDoc, bundleStocks, itemPrices);

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
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }
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

    // Ensure product data is populated first (needed for pricing)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Recalculate totals dynamically (returns itemPrices for formatCartResponse)
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    const itemPrices = totals.itemPrices;
    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }
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

    // Ensure product data is populated first (needed for pricing)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Recalculate totals dynamically
    const totals = await calculateTotals(cart.items);
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    cart.total = totals.total;
    const itemPrices = totals.itemPrices;
    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }

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

    // Empty cart - no bundle stocks or item prices needed
    const formatted = formatCartResponse(cart, null, null);

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

    // Ensure product data is populated for pricing
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    // Compute bundle stocks for BUNDLE products
    const bundleStocks = await computeBundleStocks(req, cart);

    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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

    // Ensure product data is populated for pricing
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    const bundleStocks = await computeBundleStocks(req, cart);
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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

    // Ensure product data is populated for pricing
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    const bundleStocks = await computeBundleStocks(req, cart);
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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
 *
 * CASES:
 * A: Both guestCart AND userCart exist → Merge guest INTO user, delete guest
 * B: Only userCart exists → Restore userCart (set cookie)
 * C: Only guestCart exists → Assign guestCart to user
 * D: Neither exists → Return null
 *
 * RULES:
 * - User cart ALWAYS has priority
 * - Guest cart items merge INTO user cart
 * - Duplicate items: SUM quantities
 * - After merge: delete guest cart, cookie → user cart
 */
const mergeCart = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User must be authenticated",
      });
    }

    // Step 1: Get guest cart from middleware (populated from cookie/header)
    const guestCart = req.cart; // null if no cookie or cart not found

    // Step 2: Find user's existing cart (active or checkout, different from guest cart)
    const userCart = await Cart.findOne({
      userId,
      status: { $in: ["active", "checkout"] },
      // Exclude guestCart if it exists (avoid finding same cart)
      ...(guestCart ? { cartId: { $ne: guestCart.cartId } } : {}),
    });

    // Helper to set cart cookie
    const setCartCookie = (cartId) => {
      res.cookie(CART_ID, cartId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    };

    // ═══════════════════════════════════════════════════════════════════
    // CASE A: Both carts exist → MERGE guest INTO user
    // ═══════════════════════════════════════════════════════════════════
    if (guestCart && userCart) {
      // Merge items with deduplication
      for (const guestItem of guestCart.items) {
        const existingIndex = userCart.items.findIndex(
          (item) =>
            item.productId.toString() === guestItem.productId.toString() &&
            item.variantId === guestItem.variantId,
        );

        if (existingIndex !== -1) {
          // DUPLICATE: SUM quantities
          userCart.items[existingIndex].quantity += guestItem.quantity;
        } else {
          // NEW ITEM: Add to user cart (no price snapshots - computed dynamically)
          userCart.items.push({
            productId: guestItem.productId,
            variantId: guestItem.variantId,
            quantity: guestItem.quantity,
            titleSnapshot: guestItem.titleSnapshot,
            imageSnapshot: guestItem.imageSnapshot,
            skuSnapshot: guestItem.skuSnapshot,
            attributesSnapshot: guestItem.attributesSnapshot,
          });
        }
      }

      // Delete guest cart
      await Cart.deleteOne({ cartId: guestCart.cartId });

      // Update cookie to user cart
      setCartCookie(userCart.cartId);

      // Populate product data for pricing
      await userCart.populate({
        path: "items.productId",
        select:
          "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
      });

      // Recalculate totals dynamically
      const totals = await calculateTotals(userCart.items);
      userCart.subtotal = totals.subtotal;
      userCart.tax = totals.tax;
      userCart.shippingEstimate = totals.shippingEstimate;
      userCart.total = totals.total;
      const itemPrices = totals.itemPrices;
      await userCart.save();

      const bundleStocks = await computeBundleStocks(req, userCart);
      const formatted = formatCartResponse(userCart, bundleStocks, itemPrices);
      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart merged successfully",
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CASE B: Only userCart exists → RESTORE (set cookie)
    // ═══════════════════════════════════════════════════════════════════
    if (userCart && !guestCart) {
      setCartCookie(userCart.cartId);

      // Populate product data for pricing
      await userCart.populate({
        path: "items.productId",
        select:
          "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
      });

      // Compute totals with itemPrices
      const totals = await calculateTotals(userCart.items);
      const itemPrices = totals.itemPrices;
      const bundleStocks = await computeBundleStocks(req, userCart);
      const formatted = formatCartResponse(userCart, bundleStocks, itemPrices);
      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart restored successfully",
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CASE C: Only guestCart exists → ASSIGN to user
    // ═══════════════════════════════════════════════════════════════════
    if (guestCart && !userCart) {
      // Check if guest cart is already owned by another user
      if (
        guestCart.userId &&
        guestCart.userId.toString() !== userId.toString()
      ) {
        return res.status(200).json({
          success: true,
          message: "Cart belongs to another user",
          cart: null,
        });
      }

      // Check if already assigned to this user
      if (guestCart.userId?.toString() === userId.toString()) {
        // Populate product data for pricing
        await guestCart.populate({
          path: "items.productId",
          select:
            "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
        });

        const totals = await calculateTotals(guestCart.items);
        const itemPrices = totals.itemPrices;
        const bundleStocks = await computeBundleStocks(req, guestCart);
        const formatted = formatCartResponse(
          guestCart,
          bundleStocks,
          itemPrices,
        );
        return res.status(200).json({
          success: true,
          cart: formatted,
          message: "Cart already assigned to user",
        });
      }

      guestCart.userId = userId;
      await guestCart.save();

      // Cookie already points to this cart, no need to update

      // Populate product data for pricing
      await guestCart.populate({
        path: "items.productId",
        select:
          "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
      });

      const totals = await calculateTotals(guestCart.items);
      const itemPrices = totals.itemPrices;
      const bundleStocks = await computeBundleStocks(req, guestCart);
      const formatted = formatCartResponse(guestCart, bundleStocks, itemPrices);
      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart assigned to user successfully",
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // CASE D: Neither exists → Nothing to do
    // ═══════════════════════════════════════════════════════════════════
    return res.status(200).json({
      success: true,
      message: "No cart to merge or restore",
      cart: null,
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

/**
 * POST /api/v1/cart/apply-coupon
 * Apply coupon to cart
 */
const applyCoupon = async (req, res) => {
  try {
    const cart = req.cart;
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }
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

    // ═══════════════════════════════════════════════════════════════════
    // Calculate cart value for minimum requirement using dynamic pricing
    // ═══════════════════════════════════════════════════════════════════

    // Populate product data for pricing
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config quantityRules price offerPrice offerStartAt offerEndAt",
    });

    // Compute totals dynamically
    const totals = await calculateTotals(cart.items);
    const cartItemTotal = totals.total - totals.shippingEstimate; // items + tax, excluding shipping
    const itemPrices = totals.itemPrices;

    if (cartItemTotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum cart value of ₹${coupon.minCartValue} required`,
      });
    }

    // Calculate discount based on cart total
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
    cart.subtotal = totals.subtotal;
    cart.tax = totals.tax;
    cart.shippingEstimate = totals.shippingEstimate;
    // total will be recalculated in pre-save hook minus coupon discount

    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const formatted = formatCartResponse(cart, bundleStocks, itemPrices);

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
    if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }

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
