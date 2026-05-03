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
const {
  formatCartResponse,
  normalizeAttributesSnapshot,
} = require("../../utils/formatCartResponse");
const bundleService = require("../../features/product/bundle.service");
const { PRODUCT_TYPES } = require("../../features/product/product.model");
const { cacheGetOrSet, cacheDel, TTL } = require("../../utils/redisCache");

const SiteSetting = require("../../models/SiteSetting");
const logger = require("../../utils/logger");

const CART_SETTINGS_CACHE_KEY = "cart:settings";

/**
 * Get cart settings — cached for 5 minutes.
 * Call invalidateCartSettings() after any admin shipping-config update.
 */
const getCartSettings = () =>
  cacheGetOrSet(CART_SETTINGS_CACHE_KEY, TTL.CART_SETTINGS, async () => {
    const settings = await SiteSetting.find({ scope: "cart" });
    const config = {
      freeThreshold: SHIPPING_COST.FREE_THRESHOLD,
      shippingCost: SHIPPING_COST.SHIPPING_COST,
    };
    settings.forEach((s) => {
      if (s.key === "cart.shipping.freeThreshold")
        config.freeThreshold = Number(s.value);
      if (s.key === "cart.shipping.flat")
        config.shippingCost = Number(s.value);
    });
    return config;
  });

const invalidateCartSettings = () => cacheDel(CART_SETTINGS_CACHE_KEY);

/**
 * Unified cart error responder.
 * - Intentional throws (error.statusCode): forwarded as-is
 * - Mongoose ValidationError: field-level breakdown
 * - Mongoose CastError: bad ObjectId / type mismatch
 * - Everything else: 500 with errorType + message
 * Stack traces are included only outside production.
 */
const sendCartError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      errorCode: error.errorCode || "REQUEST_ERROR",
      message: error.message,
    });
  }

  const isDev = process.env.NODE_ENV !== "production";

  if (error.name === "ValidationError") {
    const fields = Object.entries(error.errors || {}).map(([field, err]) => ({
      field,
      message: err.message,
      value: err.value,
    }));
    return res.status(500).json({
      success: false,
      message: "Validation failed",
      errorType: "ValidationError",
      fields,
      ...(isDev && { stack: error.stack }),
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field "${error.path}": ${error.value}`,
      errorType: "CastError",
    });
  }

  return res.status(500).json({
    success: false,
    message: error.message || "Internal Server Error",
    errorType: error.name || "Error",
    ...(isDev && { stack: error.stack }),
  });
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
 * Pricing stages (explicit, no ambiguity):
 * - baseSubtotal: sum of (basePrice * qty) — MRP total
 * - productDiscountTotal: baseSubtotal - discountedSubtotal — offer/tier discounts
 * - discountedSubtotal: sum of lineTotal — amount after product discounts (use for coupon eligibility)
 * - shippingEstimate, then grandTotal = discountedSubtotal + shipping (before coupon)
 *
 * @param {Array} items - Cart items (must have productId populated or as ObjectId)
 * @returns {{ baseSubtotal, productDiscountTotal, discountedSubtotal, tax, shippingEstimate, total, itemPrices: Map }}
 */
const calculateTotals = async (items) => {
  const {
    computeCartItemPricing,
  } = require("../../utils/quantityPricingUtils");

  let baseSubtotal = 0; // Sum of basePrice * quantity (MRP)
  let discountedSubtotal = 0; // Sum of lineTotal (after product-level discounts)
  const itemPrices = new Map(); // Map itemId -> pricing info

  for (const item of items) {
    // Get product ID (may be null if product was deleted)
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

    // Store for later use in formatCartResponse (guard against null _id/productId)
    const itemId =
      (item._id && item._id.toString()) ||
      (productId && productId.toString()) ||
      null;
    if (itemId) itemPrices.set(itemId, pricing);

    // Accumulate totals
    baseSubtotal += pricing.basePrice * item.quantity;
    discountedSubtotal += pricing.lineTotal;
  }

  const productDiscountTotal =
    Math.round((baseSubtotal - discountedSubtotal) * 100) / 100;
  const settings = await getCartSettings();
  // Initial shipping estimate (before coupon — will be recalculated once coupon is known)
  const shippingEstimate = calculateShipping(discountedSubtotal, settings);
  const total = discountedSubtotal + shippingEstimate;

  return {
    baseSubtotal: Math.round(baseSubtotal * 100) / 100,
    productDiscountTotal,
    discountedSubtotal: Math.round(discountedSubtotal * 100) / 100,
    tax: 0,
    shippingEstimate: Math.round(shippingEstimate * 100) / 100,
    total: Math.round(total * 100) / 100,
    itemPrices, // Map of item pricing for formatCartResponse
    settings, // Returned so callers can recalculate shipping after coupon is known
  };
};

/**
 * Assign pricing stages from calculateTotals result to a cart document.
 * @param {Object} cart - Cart document
 * @param {Object} totals - Return value of calculateTotals()
 * @param {number} [couponDiscount=0] - Coupon discount to subtract from total
 */
const assignCartTotals = (cart, totals, couponDiscount = 0) => {
  cart.baseSubtotal = totals.baseSubtotal;
  cart.productDiscountTotal = totals.productDiscountTotal;
  cart.discountedSubtotal = totals.discountedSubtotal;
  cart.subtotal = totals.baseSubtotal; // legacy: MRP subtotal for display
  cart.tax = totals.tax;
  cart.shippingEstimate = totals.shippingEstimate;
  cart.total = Math.max(0, totals.total - couponDiscount);
};

/** Sum of all applied coupon discounts on the cart */
const totalCouponDiscount = (cart) =>
  (cart.coupons || []).reduce((sum, c) => sum + (c.discountAmount ?? 0), 0);

/**
 * Recalculate each applied coupon's discountAmount based on the current cart subtotal.
 * Fetches coupon type/value from DB. Removes coupons that are no longer eligible.
 * Mutates cart.coupons in-place.
 */
const recalculateCouponDiscounts = async (cart, discountedSubtotal, itemPrices) => {
  if (!cart.coupons?.length) return;

  const updatedCoupons = [];

  for (const cartCoupon of cart.coupons) {
    // Drop coupon if cart dropped below its minimum
    const minRequired = cartCoupon.minCartValue ?? 0;
    if (minRequired > 0 && discountedSubtotal < minRequired) continue;

    // Fetch coupon to get type/value for recalculation
    const couponDoc = await Coupon.findById(cartCoupon.couponId)
      .select("type value maxDiscount applicableTo applicableProductIds isActive freeGift")
      .lean();
    if (!couponDoc || !couponDoc.isActive) {
      // Also remove orphaned gift items for this coupon
      if (cartCoupon.type === "free_gift") {
        cart.items = cart.items.filter((i) => i.freeGiftCouponCode !== cartCoupon.code);
      }
      continue;
    }

    // ── free_gift: re-check trigger condition ──────────────────────────
    if (couponDoc.type === "free_gift") {
      const fg = couponDoc.freeGift;
      if (fg?.triggerProductIds?.length) {
        const triggerIds = new Set(fg.triggerProductIds.map((id) => id.toString()));
        let triggerQty = 0;
        for (const item of cart.items) {
          const pid = (item.productId?._id || item.productId)?.toString();
          if (pid && triggerIds.has(pid) && !item.isFreeGiftCoupon) {
            triggerQty += item.quantity;
          }
        }
        if (triggerQty < (fg.triggerMinQty || 1)) {
          // Trigger no longer met — drop coupon and injected gift item
          cart.items = cart.items.filter((i) => i.freeGiftCouponCode !== cartCoupon.code);
          continue;
        }
      }
      // Trigger still met — keep coupon as-is (discount is fixed gift value)
      updatedCoupons.push({ ...cartCoupon.toObject ? cartCoupon.toObject() : cartCoupon });
      continue;
    }

    // Determine eligible subtotal (product-scoped coupons)
    let eligibleSubtotal = discountedSubtotal;
    let eligibleItemIds = null;

    if (couponDoc.applicableTo === "specific_products" && couponDoc.applicableProductIds?.length > 0) {
      const eligibleIds = new Set(couponDoc.applicableProductIds.map((id) => id.toString()));
      let qualifyingSubtotal = 0;
      const matchedItemIds = new Set();

      for (const item of cart.items) {
        const productId = (item.productId?._id || item.productId)?.toString();
        if (eligibleIds.has(productId)) {
          const itemId = (item._id && item._id.toString()) || productId;
          const pricing = itemId && itemPrices.get(itemId);
          qualifyingSubtotal += pricing ? pricing.lineTotal : 0;
          if (itemId) matchedItemIds.add(itemId);
        }
      }

      if (qualifyingSubtotal === 0) continue;
      eligibleSubtotal = qualifyingSubtotal;
      eligibleItemIds = matchedItemIds;
    }

    // Recalculate discount amount
    let discountAmount = 0;
    if (couponDoc.type === "flat") {
      discountAmount = Math.min(couponDoc.value, eligibleSubtotal);
    } else if (couponDoc.type === "percentage") {
      discountAmount = (eligibleSubtotal * couponDoc.value) / 100;
      if (couponDoc.maxDiscount && discountAmount > couponDoc.maxDiscount) {
        discountAmount = couponDoc.maxDiscount;
      }
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    // Recalculate per-line discounts
    const lineDiscounts = [];
    if (eligibleSubtotal > 0) {
      for (const item of cart.items) {
        const itemId =
          (item._id && item._id.toString()) ||
          ((item.productId?._id || item.productId)?.toString()) ||
          null;
        if (!itemId) continue;
        if (eligibleItemIds !== null && !eligibleItemIds.has(itemId)) continue;
        const pricing = itemPrices.get(itemId);
        const itemLineTotal = pricing ? pricing.lineTotal : 0;
        if (itemLineTotal === 0) continue;
        const itemDiscount =
          Math.round((itemLineTotal / eligibleSubtotal) * discountAmount * 100) / 100;
        lineDiscounts.push({ itemId, amount: itemDiscount });
      }
    }

    updatedCoupons.push({
      code: cartCoupon.code,
      couponId: cartCoupon.couponId,
      type: cartCoupon.type || couponDoc.type,
      discountAmount,
      minCartValue: cartCoupon.minCartValue,
      lineDiscounts,
    });
  }

  cart.coupons = updatedCoupons;
};

/**
 * Recompute and assign cart totals (all pricing stages).
 * Also recalculates coupon discounts based on current subtotal and adjusts
 * shipping after all discounts so the free-shipping threshold is checked against
 * what the customer actually pays.
 * Returns itemPrices map for use in formatCartResponse.
 */
const recomputeCartTotals = async (cart) => {
  const result = await calculateTotals(cart.items);
  await recalculateCouponDiscounts(cart, result.discountedSubtotal, result.itemPrices);
  const couponDiscount = totalCouponDiscount(cart);
  const payableBeforeShipping = result.discountedSubtotal - couponDiscount;
  const adjustedShipping = calculateShipping(payableBeforeShipping, result.settings);
  result.shippingEstimate = Math.round(adjustedShipping * 100) / 100;
  result.total = Math.round((result.discountedSubtotal + adjustedShipping) * 100) / 100;
  assignCartTotals(cart, result, couponDiscount);
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
    const err = new Error("Product not found");
    err.statusCode = 404;
    throw err;
  }

  // Handle BUNDLE products - compute stock from children
  if (product.product_type === PRODUCT_TYPES.BUNDLE) {
    const bundleAvailability = await bundleService.getBundleAvailability(
      product.bundle_config,
    );
    return {
      id: product._id.toString(),
      title: product.title,
      image: product.images?.[0]?.url || "",
      sku: product.sku || null,
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
      image: product.images?.[0]?.url || "",
      sku: product.sku || null,
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
    const err = new Error(`Variant '${variantId}' not found in product`);
    err.statusCode = 400;
    err.errorCode = "VARIANT_NOT_FOUND";
    throw err;
  }

  return {
    id: variant.id,
    title: product.title, // Use product title
    image: variant.images?.[0]?.url || product.images?.[0]?.url || "",
    sku: variant.sku || product.sku || null,
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
      logger.error(
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
 * Fetch gift products by SKU to get images and titles
 * Returns Map: sku -> { title, image }
 */
const fetchGiftProducts = async (items) => {
  const giftSkus = new Set();
  if (items) {
    items.forEach((item) => {
      if (item.selectedGiftSku) {
        giftSkus.add(item.selectedGiftSku);
      }
    });
  }

  if (giftSkus.size === 0) return new Map();

  const products = await Product.find({ sku: { $in: [...giftSkus] } })
    .select("sku title images")
    .lean();

  return new Map(
    products.map((p) => [
      p.sku,
      {
        title: p.title,
        image: p.images?.[0] || "",
      },
    ]),
  );
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
              "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
          });
          const totals = await calculateTotals(existingCart.items);
          const itemPrices = totals.itemPrices;
          const bundleStocks = await computeBundleStocks(req, existingCart);
          // Fetch gift products
          const giftProducts = await fetchGiftProducts(existingCart.items);
          const formatted = formatCartResponse(
            existingCart,
            bundleStocks,
            itemPrices,
            giftProducts,
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
      sameSite: "lax",
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
    logger.error("❌ Error creating cart:", error);
    sendCartError(res, error);
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
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    };
    res.cookie(CART_ID, cartId, cookieOptions);

    res.status(200).json({
      success: true,
      message: "Cookie set successfully",
    });
  } catch (error) {
    logger.error("❌ Error setting cookie:", error);
    sendCartError(res, error);
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
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Recalculate totals (coupons + shipping) based on current cart state
    const itemPrices = await recomputeCartTotals(cart);

    await cart.save();

    // Compute bundle stocks AND validation issues in ONE pass (no N+1)
    const { bundleStocks, issues } = await computeBundleStocksAndIssues(
      req,
      cart,
    );

    // Add issues for products that are no longer published (draft/archived)
    for (const item of cart.items) {
      const productDoc = item.productId;
      if (productDoc && productDoc._id && productDoc.status !== "published") {
        issues.push({
          productId: productDoc._id.toString(),
          sku: productDoc.sku,
          title: productDoc.title,
          reason: "PRODUCT_NOT_AVAILABLE",
          message: "This product is no longer available",
        });
      }
    }

    // Pass bundleStocks and itemPrices so formatCartResponse has all pricing data
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    // Cart validation result: isValid false blocks checkout when any issue (bundle stock or unpublished product)
    const isValid = issues.length === 0;

    res.status(200).json({
      success: true,
      cart: formatted,
      isValid,
    });
  } catch (error) {
    logger.error("❌ Error getting cart:", error);
    sendCartError(res, error);
  }
};

/**
 * POST /api/v1/cart/add-item
 * Add item to cart
 */
const addItem = async (req, res) => {
  try {
    let cart = req.cart;

    // Auto-recover when cart is in checkout
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
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
      "product_type bundle_config status",
    );
    if (productCheck?.status !== "published") {
      return res.status(400).json({
        success: false,
        errorCode: "PRODUCT_NOT_AVAILABLE",
        message: "This product is no longer available",
      });
    }
    if (productCheck?.product_type === PRODUCT_TYPES.CHOICE_GROUP) {
      return res.status(400).json({
        success: false,
        errorCode: "CHOICE_GROUP_NOT_SELLABLE",
        message: "Please select a gift option before adding to cart",
      });
    }

    // Validate Gift Selection for Bundles
    if (
      productCheck?.product_type === PRODUCT_TYPES.BUNDLE &&
      productCheck.bundle_config?.gift_slot?.enabled
    ) {
      if (!item.selectedGiftSku) {
        return res.status(400).json({
          success: false,
          errorCode: "GIFT_SELECTION_REQUIRED",
          message: "Please select a free gift before adding to cart",
        });
      }

      // Verify the selected gift is a valid option
      const isValidGift = productCheck.bundle_config.gift_slot.options.some(
        (opt) => opt.sku === item.selectedGiftSku,
      );

      if (!isValidGift) {
        return res.status(400).json({
          success: false,
          errorCode: "INVALID_GIFT_SELECTION",
          message:
            "The selected gift is not valid for this bundle. Please choose another.",
        });
      }
    }

    // Create cart if it doesn't exist
    let cartDoc = cart;
    if (!cartDoc) {
      const userId = req.user?.id || null;

      // For logged-in users: FIRST check for existing cart in DB
      if (userId) {
        let existingUserCart = await Cart.findOne({
          userId,
          status: { $in: ["active", "checkout"] },
        }).sort({ updatedAt: -1 });
        if (existingUserCart) {
          // Auto-recover if the fetched cart is in checkout
          if (existingUserCart.status === "checkout") {
            existingUserCart = await performRecoverCart(
              req,
              res,
              existingUserCart,
            );
          }

          if (existingUserCart) {
            // Restore user's existing cart
            cartDoc = existingUserCart;
            res.cookie(CART_ID, cartDoc.cartId, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: 30 * 24 * 60 * 60 * 1000,
              path: "/",
            });
          }
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
          sameSite: "lax",
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
    // skuSnapshot from product/variant - stable identifier for remove/update after cart recovery
    const itemData = {
      productId: item.productId,
      variantId: item.variantId || null,
      quantity: requestedQty,
      titleSnapshot: productData.title,
      imageSnapshot: productData.image,
      skuSnapshot: productData.sku || item.sku || null,
      attributesSnapshot: normalizeAttributesSnapshot(item.attributes) || null,
      selectedGiftSku: item.selectedGiftSku || null,
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
        "title url_key images stockObj variants product_type sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Get bundle stocks for bundle products
    const bundleStocks = await computeBundleStocks(req, cartDoc);
    const giftProducts = await fetchGiftProducts(cartDoc.items);
    const formatted = formatCartResponse(
      cartDoc,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    logger.error("❌ Error adding item:", error);
    sendCartError(res, error);
  }
};

/**
 * PATCH /api/v1/cart/update-item
 * Update item quantity
 */
const updateItem = async (req, res) => {
  try {
    let cart = req.cart;

    // Auto-recover when cart is in checkout
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      if (!cart) {
        return res.status(200).json({
          success: false,
          message: "Cart recovered but no items to modify",
          cart: null,
        });
      }
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }

    const { sku, selectedGiftSku, itemId, productId, variantId, changes } =
      req.body;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!sku && !productId && !itemId) {
      return res.status(400).json({
        success: false,
        message: "sku is required (or productId/itemId as fallback)",
      });
    }

    const targetItemId = findCartItem(cart, {
      sku,
      selectedGiftSku,
      itemId,
      productId,
      variantId,
    });
    if (!targetItemId) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    const { quantity } = changes || {};

    if (quantity !== undefined) {
      if (quantity <= 0) {
        cart.items.pull(targetItemId);
      } else {
        const item = cart.items.id(targetItemId);
        if (!item) {
          return res.status(404).json({
            success: false,
            message: "Item not found in cart",
          });
        }
        // Stock validation before updating quantity
        const product = await Product.findById(item.productId)
          .select("stockObj stock variants product_type bundle_config");
        if (product) {
          let available;
          if (product.product_type === PRODUCT_TYPES.BUNDLE) {
            const bundleAvail = await bundleService.getBundleAvailability(product.bundle_config);
            available = bundleAvail.availableQty;
          } else if (item.variantId) {
            const variant = product.variants?.find(
              (v) => v.id === item.variantId || v._id?.toString() === item.variantId
            );
            available = variant?.stockObj?.available ?? variant?.stock ?? 0;
          } else {
            available = product.stockObj?.available ?? product.stock ?? 0;
          }
          if (quantity > available) {
            return res.status(400).json({
              success: false,
              errorCode: "INSUFFICIENT_STOCK",
              message: `Only ${available} unit(s) available`,
              available,
            });
          }
        }
        item.quantity = quantity;
      }
    }

    // Ensure product data is populated first (needed for pricing)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Recalculate totals (coupons recalculated + shipping adjusted after discounts)
    const itemPrices = await recomputeCartTotals(cart);
    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    logger.error("❌ Error updating item:", error);
    sendCartError(res, error);
  }
};

/**
 * Find cart item by SKU (primary) or by legacy identifiers.
 * Uses skuSnapshot for stable identification independent of MongoDB _id.
 *
 * @param {Object} cart - Cart document
 * @param {Object} opts - { sku, selectedGiftSku?, itemId?, productId?, variantId? }
 * @returns {ObjectId|null} - Mongoose subdocument _id for cart.items.id() / pull()
 */
const findCartItem = (
  cart,
  { sku, selectedGiftSku, itemId, productId, variantId },
) => {
  if (!cart?.items?.length) return null;

  // 1. Primary: find by SKU (skuSnapshot) - stable across recovery, no Mongo dependency
  if (sku) {
    const skuStr = String(sku).trim();
    const giftVal = selectedGiftSku ?? null;
    const match = cart.items.find(
      (it) =>
        (it.skuSnapshot || it.sku) === skuStr &&
        (it.selectedGiftSku ?? null) === giftVal,
    );
    if (match) return match._id;
  }

  // 2. Legacy fallback: itemId (MongoDB subdocument _id)
  if (itemId) {
    const byId = cart.items.id(itemId);
    if (byId) return byId._id;
  }

  // 3. Legacy fallback: productId + variantId + selectedGiftSku
  if (productId) {
    const prodStr = productId.toString?.() || String(productId);
    const varVal = variantId ?? null;
    const giftVal = selectedGiftSku ?? null;
    const match = cart.items.find(
      (it) =>
        it.productId?.toString() === prodStr &&
        (it.variantId ?? null) === varVal &&
        (it.selectedGiftSku ?? null) === giftVal,
    );
    if (match) return match._id;
  }

  return null;
};

/**
 * DELETE /api/v1/cart/remove-item
 * Remove item from cart.
 * Accepts sku (preferred), or fallbacks: productId+variantId+selectedGiftSku, itemId.
 */
const removeItem = async (req, res) => {
  try {
    let cart = req.cart;

    // Auto-recover when cart is in checkout (user abandoned checkout, wants to modify)
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      if (!cart) {
        return res.status(200).json({
          success: false,
          message: "Cart recovered but no items to modify",
          cart: null,
        });
      }
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "Cart modification not allowed during checkout",
      });
    }

    const { sku, selectedGiftSku, itemId, productId, variantId } = req.body;

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    if (!sku && !productId && !itemId) {
      return res.status(400).json({
        success: false,
        message: "sku is required (or productId/itemId as fallback)",
      });
    }

    const targetItemId = findCartItem(cart, {
      sku,
      selectedGiftSku,
      itemId,
      productId,
      variantId,
    });
    if (!targetItemId) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    cart.items.pull(targetItemId);

    // Ensure product data is populated first (needed for pricing)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Recalculate totals (coupons recalculated + shipping adjusted after discounts)
    const itemPrices = await recomputeCartTotals(cart);
    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      cart: formatted,
    });
  } catch (error) {
    logger.error("❌ Error removing item:", error);
    sendCartError(res, error);
  }
};

/**
 * POST /api/v1/cart/clear
 * Clear all items from cart
 */
const clearCart = async (req, res) => {
  try {
    let cart = req.cart;
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
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
    logger.error("❌ Error clearing cart:", error);
    sendCartError(res, error);
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
    logger.error("❌ Error getting count:", error);
    sendCartError(res, error);
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
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    // Compute bundle stocks for BUNDLE products
    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);

    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      items: formatted.items || [],
    });
  } catch (error) {
    logger.error("❌ Error getting items:", error);
    sendCartError(res, error);
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
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      priceSummary: formatted.priceSummary,
    });
  } catch (error) {
    logger.error("❌ Error getting price summary:", error);
    sendCartError(res, error);
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
      select: "title url_key images pricing stockObj variants status",
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
    logger.error("❌ Error getting product data:", error);
    sendCartError(res, error);
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
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Compute totals with itemPrices
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      summary: {
        count: formatted.itemCount,
        priceSummary: formatted.priceSummary,
      },
    });
  } catch (error) {
    logger.error("❌ Error getting summary:", error);
    sendCartError(res, error);
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

    // Step 1: Resolve guest cart (prefer x-guest-cart-id so we never use user's restored cart as "guest")
    const guestCartIdFromHeader = req.headers["x-guest-cart-id"];
    let guestCart = null;
    if (guestCartIdFromHeader && isValidCartId(guestCartIdFromHeader)) {
      guestCart = await Cart.findOne({ cartId: guestCartIdFromHeader });
      if (guestCart && guestCart.status === "ordered") guestCart = null;
    }
    if (!guestCart) guestCart = req.cart; // fallback: middleware cookie/header cart

    // Step 2: Find user's ACTIVE cart. If only a checkout cart exists (abandoned
    // checkout), recover it into a new active cart before merging.
    const userCartQuery = {
      userId,
      status: "active",
      ...(guestCart ? { cartId: { $ne: guestCart.cartId } } : {}),
    };
    let userCart = await Cart.findOne(userCartQuery).sort({ updatedAt: -1 });

    if (!userCart) {
      const checkoutCart = await Cart.findOne({
        userId,
        status: "checkout",
        ...(guestCart ? { cartId: { $ne: guestCart.cartId } } : {}),
      }).sort({ updatedAt: -1 });

      if (checkoutCart?.items?.length) {
        userCart = await performRecoverCart(req, res, checkoutCart);
      }
    }

    // Helper to set cart cookie
    const setCartCookie = (cartId) => {
      res.cookie(CART_ID, cartId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    };

    // ═══════════════════════════════════════════════════════════════════
    // CASE A: Both carts exist → MERGE guest INTO user
    // ═══════════════════════════════════════════════════════════════════
    if (guestCart && userCart) {
      const MAX_LINE_QTY = 99;
      // Normalize for matching (undefined/null/"" treated as same)
      const norm = (v) => (v === undefined || v === "" ? null : v);
      // Merge items with deduplication (same product+variant+selectedGiftSku → sum quantities)
      // Skip free-gift items injected by coupons — guest coupons don't carry over,
      // so orphaned gift items would break coupon tracking on the user cart.
      for (const guestItem of guestCart.items) {
        if (guestItem.isFreeGiftCoupon) continue;
        const guestVar = norm(guestItem.variantId);
        const guestGift = norm(guestItem.selectedGiftSku);
        const existingIndex = userCart.items.findIndex(
          (item) =>
            item.productId.toString() === guestItem.productId.toString() &&
            norm(item.variantId) === guestVar &&
            norm(item.selectedGiftSku) === guestGift,
        );

        if (existingIndex !== -1) {
          // DUPLICATE: SUM quantities, cap at MAX_LINE_QTY
          const added =
            userCart.items[existingIndex].quantity + guestItem.quantity;
          userCart.items[existingIndex].quantity = Math.min(
            added,
            MAX_LINE_QTY,
          );
        } else {
          // NEW ITEM: Add to user cart (no price snapshots - computed dynamically)
          userCart.items.push({
            productId: guestItem.productId,
            variantId: guestItem.variantId ?? null,
            quantity: Math.min(guestItem.quantity, MAX_LINE_QTY),
            titleSnapshot: guestItem.titleSnapshot,
            imageSnapshot: guestItem.imageSnapshot,
            skuSnapshot: guestItem.skuSnapshot,
            attributesSnapshot: guestItem.attributesSnapshot,
            selectedGiftSku: guestItem.selectedGiftSku ?? null,
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
          "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
      });

      // Recalculate totals and re-validate all applied coupons against the new cart
      const itemPrices = await recomputeCartTotals(userCart);
      await userCart.save();

      const bundleStocks = await computeBundleStocks(req, userCart);
      const giftProducts = await fetchGiftProducts(userCart.items);
      const formatted = formatCartResponse(
        userCart,
        bundleStocks,
        itemPrices,
        giftProducts,
      );
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
          "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
      });

      // Compute totals with itemPrices
      const totals = await calculateTotals(userCart.items);
      const itemPrices = totals.itemPrices;
      const bundleStocks = await computeBundleStocks(req, userCart);
      const giftProducts = await fetchGiftProducts(userCart.items);
      const formatted = formatCartResponse(
        userCart,
        bundleStocks,
        itemPrices,
        giftProducts,
      );
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
        // Clear the stale cookie so subsequent requests don't keep hitting this path
        res.clearCookie(CART_ID, {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        });
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
            "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
        });

        const totals = await calculateTotals(guestCart.items);
        const itemPrices = totals.itemPrices;
        const bundleStocks = await computeBundleStocks(req, guestCart);
        const formatted = formatCartResponse(
          guestCart,
          bundleStocks,
          itemPrices,
          await fetchGiftProducts(guestCart.items),
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
          "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
      });

      const totals = await calculateTotals(guestCart.items);
      const itemPrices = totals.itemPrices;
      const bundleStocks = await computeBundleStocks(req, guestCart);
      const giftProducts = await fetchGiftProducts(guestCart.items);
      const formatted = formatCartResponse(
        guestCart,
        bundleStocks,
        itemPrices,
        giftProducts,
      );
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
    logger.error("❌ Error merging cart:", error);
    sendCartError(res, error);
  }
};

/**
 * POST /api/v1/cart/apply-coupon
 * Apply coupon to cart
 */
const applyCoupon = async (req, res) => {
  try {
    let cart = req.cart;
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
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

    // Check for first order only — guests skip this; re-validated at order placement after login
    if (coupon.isNewUserOnly && req.user?.id) {
      const userId = req.user.id;
      const previousPaidOrders = await Order.countDocuments({
        userId,
        paymentStatus: "paid",
        orderStatus: {
          $in: [
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "completed",
          ],
        },
      });

      if (previousPaidOrders > 0) {
        return res.status(400).json({
          success: false,
          message: "This coupon is valid for your first order only",
        });
      }
    }

    // Check per-user usage limit — guests skip this; re-validated at order placement after login
    if (coupon.perUserLimit && req.user?.id) {
      const userId = req.user.id;
      const userCouponUsage = await Order.countDocuments({
        userId,
        $or: [{ "coupon.couponId": coupon._id }, { "coupons.couponId": coupon._id }],
        paymentStatus: "paid",
        orderStatus: {
          $in: [
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "completed",
          ],
        },
      });

      if (userCouponUsage >= coupon.perUserLimit) {
        return res.status(400).json({
          success: false,
          message:
            coupon.perUserLimit === 1
              ? "You have already used this coupon"
              : `You have already used this coupon ${coupon.perUserLimit} times`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Calculate cart value for minimum requirement using dynamic pricing
    // ═══════════════════════════════════════════════════════════════════

    // Populate product data for pricing (include category for category-scoped coupons)
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status category",
    });

    // Compute totals dynamically (explicit pricing stages)
    const totals = await calculateTotals(cart.items);
    const itemPrices = totals.itemPrices;

    // ─── Stacking: max 2 coupons, no duplicates ──────────────────────────
    if (!cart.coupons) cart.coupons = [];
    if (cart.coupons.length >= 2) {
      return res.status(400).json({
        success: false,
        message: "You can apply a maximum of 2 coupons per order",
        errorCode: "MAX_COUPONS_REACHED",
      });
    }
    if (cart.coupons.some((c) => c.code === coupon.code)) {
      return res.status(400).json({
        success: false,
        message: "This coupon has already been applied",
        errorCode: "DUPLICATE_COUPON",
      });
    }
    if (coupon.type === "free_gift" && cart.coupons.some((c) => c.type === "free_gift")) {
      return res.status(400).json({
        success: false,
        message: "Only one free gift coupon can be applied at a time",
        errorCode: "ONE_FREE_GIFT_ONLY",
      });
    }

    // ─── Scope eligibility: build eligible item set ───────────────────────
    let eligibleSubtotal = totals.discountedSubtotal;
    // Track which item IDs are in scope (null = all items)
    let eligibleItemIds = null;

    if (coupon.applicableTo === "specific_products" && coupon.applicableProductIds?.length > 0) {
      const eligibleIds = new Set(coupon.applicableProductIds.map((id) => id.toString()));
      let qualifyingSubtotal = 0;
      const matchedItemIds = new Set();

      for (const item of cart.items) {
        const productId = (item.productId?._id || item.productId)?.toString();
        if (eligibleIds.has(productId)) {
          const itemId = (item._id && item._id.toString()) || productId;
          const pricing = itemId && itemPrices.get(itemId);
          qualifyingSubtotal += pricing ? pricing.lineTotal : 0;
          if (itemId) matchedItemIds.add(itemId);
        }
      }

      if (qualifyingSubtotal === 0) {
        const Prod = require("../../models/Product");
        const eligibleProducts = await Prod.find(
          { _id: { $in: coupon.applicableProductIds } },
          "title",
        ).lean();
        const names = eligibleProducts.map((p) => p.title).join(", ");
        return res.status(400).json({
          success: false,
          message: `This coupon is valid only for: ${names}`,
          errorCode: "PRODUCT_NOT_IN_CART",
        });
      }

      eligibleSubtotal = qualifyingSubtotal;
      eligibleItemIds = matchedItemIds;
    } else if (coupon.applicableTo === "category" && coupon.applicableCategories?.length > 0) {
      const eligibleCatIds = new Set(coupon.applicableCategories.map((id) => id.toString()));
      let qualifyingSubtotal = 0;
      const matchedItemIds = new Set();

      for (const item of cart.items) {
        const product = item.productId;
        const catId = (product?.category?._id || product?.category)?.toString();
        if (catId && eligibleCatIds.has(catId)) {
          const itemId = (item._id && item._id.toString()) || (product?._id ? product._id.toString() : null);
          const pricing = itemId && itemPrices.get(itemId);
          qualifyingSubtotal += pricing ? pricing.lineTotal : 0;
          if (itemId) matchedItemIds.add(itemId);
        }
      }

      if (qualifyingSubtotal === 0) {
        const Category = require("../../models/Category");
        const cats = await Category.find({ _id: { $in: coupon.applicableCategories } }, "name").lean();
        const names = cats.map((c) => c.name).join(", ");
        return res.status(400).json({
          success: false,
          message: `This coupon is valid only for products in: ${names}`,
          errorCode: "CATEGORY_NOT_IN_CART",
        });
      }

      eligibleSubtotal = qualifyingSubtotal;
      eligibleItemIds = matchedItemIds;
    }

    // Minimum cart value checked against eligible subtotal (Shopify behaviour)
    if (eligibleSubtotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value of ₹${coupon.minCartValue} required`,
      });
    }

    // ─── Free gift coupon branch ──────────────────────────────────────────
    if (coupon.type === "free_gift") {
      const fg = coupon.freeGift;
      if (!fg?.triggerProductIds?.length) {
        return res.status(400).json({
          success: false,
          message: "This coupon is not configured correctly. Please contact support.",
        });
      }

      // Check trigger products are in cart with sufficient qty
      const triggerIds = new Set(fg.triggerProductIds.map((id) => id.toString()));
      let triggerQtyInCart = 0;
      for (const item of cart.items) {
        const pid = (item.productId?._id || item.productId)?.toString();
        if (pid && triggerIds.has(pid) && !item.isFreeGiftCoupon) {
          triggerQtyInCart += item.quantity;
        }
      }
      if (triggerQtyInCart < fg.triggerMinQty) {
        const triggerProducts = await Product.find(
          { _id: { $in: fg.triggerProductIds } },
          "title",
        ).lean();
        const names = triggerProducts.map((p) => p.title).join(", ");
        return res.status(400).json({
          success: false,
          message: `Add at least ${fg.triggerMinQty} of ${names} to qualify for this gift`,
          errorCode: "TRIGGER_PRODUCT_NOT_IN_CART",
        });
      }

      const isCustomGift = fg.giftType === "custom";

      if (isCustomGift) {
        // Custom gift: no cart item injection — admin fulfills it manually during packing
        cart.coupons.push({
          code: coupon.code,
          couponId: coupon._id,
          type: "free_gift",
          discountAmount: 0,
          minCartValue: coupon.minCartValue ?? 0,
          lineDiscounts: [],
        });
      } else {
        // Product gift: look up catalog item, check stock, inject into cart
        if (!fg.giftProductId) {
          return res.status(400).json({
            success: false,
            message: "This coupon is not configured correctly. Please contact support.",
          });
        }

        const giftProduct = await Product.findById(fg.giftProductId).lean();
        if (!giftProduct) {
          return res.status(400).json({
            success: false,
            message: "Gift product is no longer available",
            errorCode: "GIFT_PRODUCT_NOT_FOUND",
          });
        }
        const giftStock = giftProduct.stockObj?.available ?? giftProduct.stock ?? 0;
        if (giftStock < fg.giftQty) {
          return res.status(400).json({
            success: false,
            message: "The free gift is currently out of stock",
            errorCode: "GIFT_PRODUCT_OUT_OF_STOCK",
          });
        }

        const giftPrice = giftProduct.offerPrice || giftProduct.price || 0;
        cart.items.push({
          productId: giftProduct._id,
          variantId: null,
          quantity: fg.giftQty,
          titleSnapshot: giftProduct.title,
          imageSnapshot: giftProduct.images?.[0] || "",
          skuSnapshot: giftProduct.sku || null,
          isFreeGiftCoupon: true,
          freeGiftCouponCode: coupon.code,
        });

        cart.coupons.push({
          code: coupon.code,
          couponId: coupon._id,
          type: "free_gift",
          discountAmount: Math.round(giftPrice * fg.giftQty * 100) / 100,
          minCartValue: coupon.minCartValue ?? 0,
          lineDiscounts: [],
        });
      }

      // Recalculate totals (gift item has price 0 so totals don't change monetarily)
      const couponDiscountTotal = totalCouponDiscount(cart);
      const payableBeforeShipping = totals.discountedSubtotal - couponDiscountTotal;
      const adjustedShipping = calculateShipping(payableBeforeShipping, totals.settings);
      totals.shippingEstimate = Math.round(adjustedShipping * 100) / 100;
      totals.total = Math.round((totals.discountedSubtotal + adjustedShipping) * 100) / 100;
      assignCartTotals(cart, totals, couponDiscountTotal);

      await cart.save();

      const bundleStocksGift = await computeBundleStocks(req, cart);
      const giftProductsMap = await fetchGiftProducts(cart.items);
      const formattedGift = formatCartResponse(cart, bundleStocksGift, itemPrices, giftProductsMap);

      return res.status(200).json({
        success: true,
        cart: formattedGift,
        message: `🎁 Free gift coupon applied!`,
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    // Calculate discount — flat is capped at eligibleSubtotal (Shopify behaviour)
    let discountAmount = 0;
    if (coupon.type === "flat") {
      discountAmount = Math.min(coupon.value, eligibleSubtotal);
    } else if (coupon.type === "percentage") {
      discountAmount = (eligibleSubtotal * coupon.value) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    // ─── Per-line-item discount distribution (Shopify-style) ─────────────
    const lineDiscounts = [];
    if (eligibleSubtotal > 0) {
      for (const item of cart.items) {
        const itemId =
          (item._id && item._id.toString()) ||
          ((item.productId?._id || item.productId)?.toString()) ||
          null;
        if (!itemId) continue;
        if (eligibleItemIds !== null && !eligibleItemIds.has(itemId)) continue;
        const pricing = itemPrices.get(itemId);
        const itemLineTotal = pricing ? pricing.lineTotal : 0;
        if (itemLineTotal === 0) continue;
        const itemDiscount = Math.round((itemLineTotal / eligibleSubtotal) * discountAmount * 100) / 100;
        lineDiscounts.push({ itemId, amount: itemDiscount });
      }
    }

    // Push coupon into coupons array
    cart.coupons.push({
      code: coupon.code,
      couponId: coupon._id,
      type: coupon.type,
      discountAmount,
      minCartValue: coupon.minCartValue ?? 0,
      lineDiscounts,
    });

    // Recalculate shipping after coupon so threshold is checked against actual payable amount
    const couponDiscountTotal = totalCouponDiscount(cart);
    const payableBeforeShipping = totals.discountedSubtotal - couponDiscountTotal;
    const adjustedShipping = calculateShipping(payableBeforeShipping, totals.settings);
    totals.shippingEstimate = Math.round(adjustedShipping * 100) / 100;
    totals.total = Math.round((totals.discountedSubtotal + adjustedShipping) * 100) / 100;

    // Assign totals with combined coupon discount
    assignCartTotals(cart, totals, couponDiscountTotal);

    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      cart: formatted,
      message: "Coupon applied successfully",
    });
  } catch (error) {
    logger.error("❌ Error applying coupon:", error);
    sendCartError(res, error);
  }
};

/**
 * DELETE /api/v1/cart/remove-coupon
 * Remove coupon from cart
 */
const removeCoupon = async (req, res) => {
  try {
    let cart = req.cart;
    if (cart && cart.status === "checkout") {
      cart = await performRecoverCart(req, res, cart);
      req.cart = cart;
    } else if (cart && cart.status !== "active") {
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

    const { code } = req.body;
    if (code) {
      const upperCode = code.toUpperCase();
      const removedCoupon = (cart.coupons || []).find((c) => c.code === upperCode);
      // If removing a free_gift coupon, also remove the injected gift item
      if (removedCoupon?.type === "free_gift") {
        cart.items = cart.items.filter((item) => item.freeGiftCouponCode !== upperCode);
      }
      cart.coupons = (cart.coupons || []).filter((c) => c.code !== upperCode);
    } else {
      // Remove all coupons (backward compat) — also remove all gift items
      const giftCodes = new Set(
        (cart.coupons || []).filter((c) => c.type === "free_gift").map((c) => c.code),
      );
      if (giftCodes.size > 0) {
        cart.items = cart.items.filter((item) => !item.isFreeGiftCoupon);
      }
      cart.coupons = [];
    }

    // Populate for formatCartResponse
    await cart.populate({
      path: "items.productId",
      select:
        "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
    });

    // Recalculate totals with remaining coupons
    const totals = await calculateTotals(cart.items);
    const remainingCouponDiscount = totalCouponDiscount(cart);
    const payableBeforeShipping = totals.discountedSubtotal - remainingCouponDiscount;
    const adjustedShipping = calculateShipping(payableBeforeShipping, totals.settings);
    totals.shippingEstimate = Math.round(adjustedShipping * 100) / 100;
    totals.total = Math.round((totals.discountedSubtotal + adjustedShipping) * 100) / 100;
    assignCartTotals(cart, totals, remainingCouponDiscount);

    await cart.save();

    const bundleStocks = await computeBundleStocks(req, cart);
    const giftProducts = await fetchGiftProducts(cart.items);
    const formatted = formatCartResponse(
      cart,
      bundleStocks,
      totals.itemPrices,
      giftProducts,
    );

    res.status(200).json({
      success: true,
      cart: formatted,
      message: "Coupon removed successfully",
    });
  } catch (error) {
    logger.error("❌ Error removing coupon:", error);
    sendCartError(res, error);
  }
};

/**
 * GET /api/v1/cart/coupons
 * Get list of available coupons
 */
const getAvailableCoupons = async (req, res) => {
  try {
    const now = new Date();
    const userId = req.user?.id || null;

    // Check if logged-in user has previous paid orders
    // so we can hide first-order-only coupons from returning customers
    let hasExistingOrders = false;
    if (userId) {
      const paidOrderCount = await Order.countDocuments({
        userId,
        paymentStatus: "paid",
        orderStatus: {
          $in: [
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "completed",
          ],
        },
      });
      hasExistingOrders = paidOrderCount > 0;
    }

    const coupons = await Coupon.find({
      isActive: true,
      isPublic: { $ne: false }, // hide secret coupons from the list
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    })
      .select(
        "code type value minCartValue maxDiscount endDate isNewUserOnly perUserLimit applicableTo applicableProductIds applicableCategories freeGift",
      )
      .populate("applicableProductIds", "title images")
      .populate("applicableCategories", "name code")
      .populate("freeGift.triggerProductIds", "title images")
      .populate("freeGift.giftProductId", "title images")
      .sort({ endDate: 1 });

    // Filter out first-order-only coupons for users who already have paid orders
    const visibleCoupons = hasExistingOrders
      ? coupons.filter((coupon) => !coupon.isNewUserOnly)
      : coupons;

    const formattedCoupons = visibleCoupons.map((coupon) => {
      let description;
      let freeGiftInfo = null;

      if (coupon.type === "free_gift" && coupon.freeGift) {
        const fg = coupon.freeGift;
        const isCustomGift = fg.giftType === "custom";
        const giftTitle = isCustomGift
          ? (fg.giftLabel || "item")
          : (fg.giftProductId?.title || "item");
        const triggerQty = fg.triggerMinQty || 1;
        const giftQty = fg.giftQty || 1;
        description = `Buy ${triggerQty}, get ${giftQty} ${giftTitle} free!`;
        freeGiftInfo = {
          triggerProducts: (fg.triggerProductIds || []).map((p) => ({
            _id: p._id,
            title: p.title,
            image: p.images?.[0] || null,
          })),
          triggerMinQty: triggerQty,
          giftType: fg.giftType || "product",
          giftLabel: isCustomGift ? (fg.giftLabel || null) : null,
          giftProduct: !isCustomGift && fg.giftProductId
            ? {
                _id: fg.giftProductId._id,
                title: fg.giftProductId.title,
                image: fg.giftProductId.images?.[0] || null,
              }
            : null,
          giftQty,
        };
      } else if (coupon.type === "flat") {
        description = `Flat ₹${coupon.value} off`;
      } else {
        description = `${coupon.value}% off${
          coupon.maxDiscount ? ` up to ₹${coupon.maxDiscount}` : ""
        }`;
      }

      if (coupon.isNewUserOnly) {
        description += " (First order only)";
      }

      const applicableProducts =
        coupon.applicableTo === "specific_products"
          ? (coupon.applicableProductIds || []).map((p) => ({
              _id: p._id,
              title: p.title,
              image: p.images?.[0] || null,
            }))
          : [];

      const applicableCategories =
        coupon.applicableTo === "category"
          ? (coupon.applicableCategories || []).map((c) => ({
              _id: c._id,
              name: c.name,
              code: c.code,
            }))
          : [];

      return {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount || null,
        description,
        minCartValue: coupon.minCartValue,
        expiresAt: coupon.endDate,
        isNewUserOnly: coupon.isNewUserOnly || false,
        perUserLimit: coupon.perUserLimit || 0,
        requiresLogin: !!(coupon.isNewUserOnly || coupon.perUserLimit),
        applicableTo: coupon.applicableTo || "all",
        applicableProducts,
        applicableCategories,
        freeGift: freeGiftInfo,
      };
    });

    res.status(200).json({
      success: true,
      coupons: formattedCoupons,
    });
  } catch (error) {
    logger.error("❌ Error getting coupons:", error);
    sendCartError(res, error);
  }
};

/**
 * Internal: Recover a locked/checkout cart into a new active cart.
 * Sets cookie and returns the new cart. Used by recoverCart and auto-recover on modification.
 * @param {Object} req - Express request
 * @param {Object} res - Express response (for setting cookie)
 * @param {Object} lockedCart - Cart in checkout/ordered/abandoned status
 * @returns {Object|null} New active cart or null if nothing to recover
 */
const performRecoverCart = async (req, res, lockedCart) => {
  if (!lockedCart?.items?.length) return null;

  const newCartId = generateCartId();
  const userId = req.user?.id || (lockedCart.userId ? lockedCart.userId : null);

  // Exclude injected free-gift items — coupons are not cloned so gifts would be orphaned
  const newItems = lockedCart.items
    .filter((item) => !item.isFreeGiftCoupon)
    .map((item) => ({
      _id: item._id, // Preserve for seamless frontend (itemId still works after recovery)
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      titleSnapshot: item.titleSnapshot,
      imageSnapshot: item.imageSnapshot,
      skuSnapshot: item.skuSnapshot,
      attributesSnapshot: item.attributesSnapshot,
      selectedGiftSku: item.selectedGiftSku,
    }));

  // Carry over non-free-gift coupons (free_gift coupons are tied to injected items we filtered out)
  const newCoupons = (lockedCart.coupons || [])
    .filter((c) => c.type !== "free_gift")
    .map((c) => ({ ...c.toObject ? c.toObject() : c }));

  const newCart = await Cart.create({
    cartId: newCartId,
    userId,
    items: newItems,
    status: "active",
    coupon: undefined,
    coupons: newCoupons,
  });

  // Mark the old cart as abandoned so it never gets resurrected as a ghost cart
  lockedCart.status = "abandoned";
  await lockedCart.save();

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
  res.cookie(CART_ID, newCartId, cookieOptions);
  return newCart;
};

/**
 * POST /api/v1/cart/recover
 * Recover locked cart (clone to new ID)
 */
const recoverCart = async (req, res) => {
  try {
    const lockedCart = req.cart;

    // If no cart to recover, create a brand-new empty cart inline.
    // NOTE: We cannot call createCart(req, res) here because createCart
    // destructures req.body (which may be undefined on some clients), causing
    // a TypeError crash. Instead, create the cart directly.
    if (!lockedCart) {
      const newCartId = generateCartId();
      const userId = req.user?.id || null;
      const emptyCart = await Cart.create({
        cartId: newCartId,
        userId,
        items: [],
        status: "active",
      });
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      };
      res.cookie(CART_ID, newCartId, cookieOptions);
      const formatted = formatCartResponse(emptyCart, null, null);
      return res.status(201).json({
        success: true,
        cart: formatted,
        message: "New cart created",
      });
    }

    // Use internal helper for recovery logic
    const newCart =
      lockedCart.items?.length > 0
        ? await performRecoverCart(req, res, lockedCart)
        : null;

    if (!newCart) {
      // Empty cart - create fresh
      const newCartId = generateCartId();
      const userId =
        req.user?.id || (lockedCart.userId ? lockedCart.userId : null);
      const emptyCart = await Cart.create({
        cartId: newCartId,
        userId,
        items: [],
        status: "active",
      });
      res.cookie(CART_ID, newCartId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
      });
      const formatted = formatCartResponse(emptyCart, null, null);
      return res.status(200).json({
        success: true,
        cart: formatted,
        message: "Cart recovered successfully",
      });
    }

    // Populate for response
    if (newCart.items.length > 0) {
      try {
        await newCart.populate({
          path: "items.productId",
          select:
            "title url_key images stockObj variants product_type bundle_config sku quantityRules price offerPrice offerStartAt offerEndAt status",
        });

        // calculateTotals skips items with null/missing products (no crash)
        const totals = await calculateTotals(newCart.items);
        assignCartTotals(newCart, totals, 0);
        const itemPrices = totals.itemPrices;
        // pre-validate hook auto-cleans items with null productId before save
        await newCart.save();

        const bundleStocks = await computeBundleStocks(req, newCart);
        const formatted = formatCartResponse(newCart, bundleStocks, itemPrices);

        return res.status(200).json({
          success: true,
          cart: formatted,
          message: "Cart recovered successfully",
        });
      } catch (populateErr) {
        logger.error(
          "❌ [recoverCart] Populate/save error after recovery:",
          populateErr.message,
        );
        // Fallback: return cart shell without pricing (pre-validate may have cleaned items)
        const formatted = formatCartResponse(newCart, null, null);
        return res.status(200).json({
          success: true,
          cart: formatted,
          message: "Cart recovered successfully",
        });
      }
    }

    // Empty cart response
    const formatted = formatCartResponse(newCart, null, null);
    return res.status(200).json({
      success: true,
      cart: formatted,
      message: "Cart recovered successfully",
    });
  } catch (error) {
    logger.error("❌ Error recovering cart:", error);
    sendCartError(res, error);
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
  recoverCart,
  invalidateCartSettings,
};
