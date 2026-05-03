// utils/formatCartResponse.js

/**
 * Normalize variant attributes to a single key per attribute (lowercase).
 * Collapses duplicates like { Size: "3-6", size: "3-6" } -> { size: "3-6" }.
 * @param {Object|Map|null} attrs - Plain object or Map of attribute key -> value
 * @returns {Object|null} Plain object with lowercase keys, or null
 */
function normalizeAttributesSnapshot(attrs) {
  if (attrs == null) return null;
  const entries =
    attrs instanceof Map ? [...attrs.entries()] : Object.entries(attrs);
  if (entries.length === 0) return null;
  const normalized = {};
  for (const [k, v] of entries) {
    if (k != null && String(v) !== "") normalized[k.toLowerCase()] = String(v);
  }
  return Object.keys(normalized).length ? normalized : null;
}

/**
 * Safely extract a clean HTTP URL string from a single image entry.
 * Products can have images stored in several formats due to data migrations:
 *   - Plain string URL: "https://res.cloudinary.com/..."
 *   - Stringified object: "{'0':'h','1':'t',...}" (Next.js Image crashes on this)
 *   - Actual char-indexed object: { '0':'h', '1':'t', ... }
 *   - String with "[object Object]" appended
 * Returns empty string for anything that can't be resolved to an http URL.
 */
function extractImageUrl(img) {
  if (!img) return "";

  if (typeof img === "object") {
    try {
      const sortedKeys = Object.keys(img).sort((a, b) => parseInt(a) - parseInt(b));
      const url = sortedKeys.map((k) => img[k]).join("");
      return url.startsWith("http") ? url : "";
    } catch {
      return "";
    }
  }

  if (typeof img === "string") {
    if (img.includes("[object Object]")) {
      img = img.split("[object Object]")[0];
    }
    if (img.trim().startsWith("{") && img.includes("'0':")) {
      try {
        const matches = [...img.matchAll(/'(\d+)':\s*'([^']*)'/g)];
        if (matches.length > 0) {
          const url = matches
            .sort((a, b) => parseInt(a[1]) - parseInt(b[1]))
            .map((m) => m[2])
            .join("");
          return url.startsWith("http") ? url : "";
        }
      } catch {
        return "";
      }
    }
    return img.startsWith("http") ? img : "";
  }

  return "";
}

/**
 * Check if cart contains any BUNDLE products
 */
const cartHasBundles = (cart) => {
  if (!cart || !cart.items) return false;
  return cart.items.some((item) => item.productId?.product_type === "BUNDLE");
};

/**
 * Format cart response - ensures MongoDB _id is never exposed
 * Only cartId is exposed, never the cart document's MongoDB _id
 *
 * IMPORTANT: If cart contains BUNDLE products, bundleStocks is REQUIRED.
 * This prevents future regressions where bundles show stock=0.
 *
 * @param {Object} cart - Cart document with populated items
 * @param {Map} bundleStocks - Map of productId -> bundleAvailableQty for BUNDLE products
 * @param {Map} itemPrices - Map of itemId -> pricing info from calculateTotals
 */
const formatCartResponse = (
  cart,
  bundleStocks = null,
  itemPrices = null,
  giftProductsMap = null,
) => {
  if (!cart) return null;

  // Enforce bundleStocks for carts with bundles (prevents regressions)
  if (!bundleStocks && cartHasBundles(cart)) {
    console.error(
      "⚠️ formatCartResponse: bundleStocks required for cart with BUNDLE products",
    );
  }

  // Format items
  const formattedItems = cart.items.map((item) => {
    // Calculate stock based on product type
    let stock = 0;
    const product = item.productId;

    if (product && product._id) {
      const productType = product.product_type || "SIMPLE";

      if (productType === "BUNDLE") {
        // For bundles, use pre-computed bundleStocks or default to 0
        if (bundleStocks && bundleStocks.has(product._id.toString())) {
          stock = bundleStocks.get(product._id.toString());
        }
      } else if (item.variantId && Array.isArray(product.variants)) {
        // CONFIGURABLE with variant
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (variant) {
          stock = variant.stockObj?.available ?? variant.stock ?? 0;
        }
      } else {
        // SIMPLE product stock
        stock =
          product?.stockObj?.available ??
          product?._doc?.stockObj?.available ??
          0;
      }
    }

    // Get pricing from itemPrices map (computed dynamically)
    const itemId =
      (item._id && item._id.toString()) ||
      (item.productId &&
        (item.productId._id
          ? item.productId._id.toString()
          : item.productId.toString())) ||
      null;
    const pricing = itemPrices ? itemPrices.get(itemId) : null;

    // Per-item coupon discount (sum across all applied coupons)
    const itemCouponDiscount = (cart.coupons || []).reduce((sum, c) => {
      const ld = (c.lineDiscounts || []).find((l) => l.itemId === itemId);
      return sum + (ld?.amount ?? 0);
    }, 0);

    const isUnavailable = !!(product && product.status !== "published");

    const itemObj = {
      _id: (item._id && item._id.toString()) || null, // Item ID (embedded document ID, needed for updates)
      unavailable: isUnavailable,
      productId:
        (item.productId &&
          (item.productId._id
            ? item.productId._id.toString()
            : item.productId.toString())) ||
        null,
      variantId: item.variantId || null,
      quantity: item.quantity,
      stock,
      // New dynamic pricing fields (replaces priceSnapshot/discountPriceSnapshot)
      unitPrice: pricing?.unitPrice ?? 0,
      basePrice: pricing?.basePrice ?? 0,
      originalPrice: pricing?.originalPrice ?? pricing?.basePrice ?? 0,
      lineTotal: pricing?.lineTotal ?? 0,
      couponDiscount: itemCouponDiscount > 0 ? itemCouponDiscount : undefined,
      // Pricing metadata for tier messaging
      pricingMeta: pricing
        ? {
            appliedRule: pricing.appliedRule,
            nextTier: pricing.nextTier,
            savings: pricing.savings,
            isOfferActive: pricing.isOfferActive,
          }
        : null,
      // Display snapshots (fall back to populated product data for legacy items
      // that were saved before imageSnapshot was written correctly)
      titleSnapshot: item.titleSnapshot || product?.title || "",
      imageSnapshot: item.imageSnapshot || extractImageUrl(product?.images?.[0]),
      skuSnapshot: item.skuSnapshot || product?.sku || null,
      attributesSnapshot: normalizeAttributesSnapshot(
        item.attributesSnapshot
          ? Object.fromEntries(item.attributesSnapshot)
          : null,
      ),
      selectedGiftSku: item.selectedGiftSku || null,
      selectedGift: null, // Default
    };

    // Enrich with selected gift details if applicable
    if (item.selectedGiftSku) {
      let label = null;
      let image = "";
      let title = "";

      // 1. Get label from bundle config (productId may be Mongoose doc or plain object)
      const product = item.productId?._doc ?? item.productId;
      const bundleConfig = product?.bundle_config;
      if (bundleConfig?.gift_slot?.options) {
        const option = bundleConfig.gift_slot.options.find(
          (o) => o.sku === item.selectedGiftSku,
        );
        if (option) label = option.label;
      }

      // 2. Get image/title from fetched gift products map
      if (giftProductsMap && giftProductsMap.has(item.selectedGiftSku)) {
        const data = giftProductsMap.get(item.selectedGiftSku);
        image = data.image ?? "";
        title = data.title ?? "";
      }

      itemObj.selectedGift = {
        sku: item.selectedGiftSku,
        label: label || "Free Gift",
        image,
        title,
      };
    }

    // Include populated product data if available (no bundle_config - selectedGift is enough)
    if (item.productId?._id) {
      itemObj.product = {
        _id: (item.productId._id && item.productId._id.toString()) || null,
        title: item.productId.title,
        url_key: item.productId.url_key,
        product_type: item.productId.product_type || "SIMPLE",
        images: Array.isArray(item.productId.images)
          ? item.productId.images.map(extractImageUrl).filter(Boolean)
          : [],
      };
    }

    return itemObj;
  });

  return {
    cartId: cart.cartId, // Only cartId, never MongoDB _id
    userId: cart.userId ? cart.userId.toString() : null,
    items: formattedItems,
    subtotal: cart.subtotal || 0,
    /** Amount after product discounts (before coupon). Use for coupon eligibility (min cart value). */
    discountedSubtotal: cart.discountedSubtotal ?? cart.subtotal ?? 0,
    tax: cart.tax || 0,
    shippingEstimate: cart.shippingEstimate || 0,
    total: cart.total || 0,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    updatedAt: cart.updatedAt,
    coupons: cart.coupons || [],
    priceSummary: generatePriceSummary(cart, formattedItems),
  };
};

const generatePriceSummary = (cart, formattedItems) => {
  const lines = [];

  // Calculate totals from item pricing
  let totalOriginalPrice = 0;
  let totalUnitPrice = 0;
  let totalTierSavings = 0;

  formattedItems.forEach((item) => {
    // originalPrice is MRP, unitPrice is final price (after offer + tier)
    const originalPrice = item.originalPrice || item.unitPrice || 0;
    const unitPrice = item.unitPrice || 0;

    totalOriginalPrice += originalPrice * item.quantity;
    totalUnitPrice += unitPrice * item.quantity;

    if (item.pricingMeta?.savings) {
      totalTierSavings += item.pricingMeta.savings;
    }
  });

  // 1. Subtotal = MRP/original price total (strikethrough baseline)
  lines.push({
    key: "items_subtotal",
    label: "Subtotal",
    amount: totalOriginalPrice,
    type: "base",
    order: 1,
  });

  // Discount on MRP (product-level discount = MRP total - discounted total from items)
  const offerDiscount = totalOriginalPrice - totalUnitPrice;
  if (offerDiscount > 0) {
    lines.push({
      key: "discount_on_mrp",
      label: "Discount on MRP",
      amount: -offerDiscount,
      type: "discount",
      order: 1.5,
    });
  }

  // Tier/Bulk discount
  if (totalTierSavings > 0) {
    lines.push({
      key: "bulk_discount",
      label: "Bulk Discount",
      amount: -totalTierSavings,
      type: "discount",
      order: 1.6,
    });
  }

  // 2. Coupon Discounts (one line per applied coupon)
  (cart.coupons || []).forEach((c) => {
    if (c.discountAmount > 0) {
      lines.push({
        key: `coupon_${c.code}`,
        label: `Coupon (${c.code})`,
        amount: -c.discountAmount,
        type: "discount",
        order: 2,
      });
    }
  });

  // 3. Shipping
  lines.push({
    key: "shipping",
    label: "Shipping",
    amount: cart.shippingEstimate || 0,
    type: "charge",
    estimated: true,
    order: 3,
  });

  // Compute payable from breakdown so coupons are always deducted (defense in depth)
  const couponDiscount = (cart.coupons || []).reduce((sum, c) => sum + (c.discountAmount || 0), 0);
  let payableAmount =
    totalOriginalPrice - offerDiscount - totalTierSavings - couponDiscount;
  payableAmount += cart.shippingEstimate || 0;
  payableAmount = Math.max(0, Math.round(payableAmount * 100) / 100);

  return {
    currency: "INR",
    lines: lines,
    payable: {
      label: "Total Payable",
      amount: payableAmount,
    },
    appliedCoupon: cart.coupons?.length
      ? { code: cart.coupons[0].code, discountAmount: cart.coupons[0].discountAmount }
      : null,
    appliedCoupons: (cart.coupons || []).map((c) => ({
      code: c.code,
      discountAmount: c.discountAmount,
    })),
  };
};

module.exports = { formatCartResponse, normalizeAttributesSnapshot };
