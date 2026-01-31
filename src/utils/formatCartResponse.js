// utils/formatCartResponse.js

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
  giftProductsMap = null
) => {
  if (!cart) return null;

  // Enforce bundleStocks for carts with bundles (prevents regressions)
  if (!bundleStocks && cartHasBundles(cart)) {
    console.error(
      "⚠️ formatCartResponse: bundleStocks required for cart with BUNDLE products"
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
    const itemId = item._id ? item._id.toString() : item.productId.toString();
    const pricing = itemPrices ? itemPrices.get(itemId) : null;

    const itemObj = {
      _id: item._id.toString(), // Item ID (embedded document ID, needed for updates)
      productId: item.productId?._id
        ? item.productId._id.toString()
        : item.productId.toString(),
      variantId: item.variantId || null,
      quantity: item.quantity,
      stock,
      // New dynamic pricing fields (replaces priceSnapshot/discountPriceSnapshot)
      unitPrice: pricing?.unitPrice ?? 0,
      basePrice: pricing?.basePrice ?? 0,
      originalPrice: pricing?.originalPrice ?? pricing?.basePrice ?? 0,
      lineTotal: pricing?.lineTotal ?? 0,
      // Pricing metadata for tier messaging
      pricingMeta: pricing
        ? {
            appliedRule: pricing.appliedRule,
            nextTier: pricing.nextTier,
            savings: pricing.savings,
            isOfferActive: pricing.isOfferActive,
          }
        : null,
      // Display snapshots (fallback to product.sku when skuSnapshot missing on legacy items)
      titleSnapshot: item.titleSnapshot,
      imageSnapshot: item.imageSnapshot,
      skuSnapshot: item.skuSnapshot || product?.sku || null,
      attributesSnapshot: item.attributesSnapshot
        ? Object.fromEntries(item.attributesSnapshot)
        : null,
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
          (o) => o.sku === item.selectedGiftSku
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
        _id: item.productId._id.toString(),
        title: item.productId.title,
        url_key: item.productId.url_key,
        product_type: item.productId.product_type || "SIMPLE",
        images: Array.isArray(item.productId.images)
          ? item.productId.images
              .map((img) => {
                if (typeof img === "object" && img !== null) {
                  // Handle actual object case (as before)
                  try {
                    const sortedKeys = Object.keys(img).sort(
                      (a, b) => parseInt(a) - parseInt(b)
                    );
                    return sortedKeys.map((k) => img[k]).join("");
                  } catch (e) {
                    return null;
                  }
                }

                if (typeof img === "string") {
                  // Check for the specific malformed pattern: starts with { and has '0': '...'
                  if (img.trim().startsWith("{") && img.includes("'0':")) {
                    try {
                      // Extract characters using regex looking for '0': 'h', '1': 't', etc.
                      // Pattern: 'KEY': 'VALUE'
                      const matches = [...img.matchAll(/'\\d+':\\s*'([^'])'/g)];
                      if (matches.length > 0) {
                        // Reconstruct the string
                        return matches.map((m) => m[1]).join("");
                      }
                    } catch (e) {
                      return null;
                    }
                  }
                  // Clean standard URLs that might have garbage appended (saw [object Object] in user log)
                  if (img.includes("[object Object]")) {
                    return img.split("[object Object]")[0];
                  }
                  return img;
                }
                return null;
              })
              .filter(
                (url) =>
                  url && typeof url === "string" && url.startsWith("http")
              )
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
    tax: cart.tax || 0,
    shippingEstimate: cart.shippingEstimate || 0,
    total: cart.total || 0,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    updatedAt: cart.updatedAt,
    priceSummary: generatePriceSummary(cart, formattedItems),
  };
};

const generatePriceSummary = (cart, formattedItems) => {
  const lines = [];
  const offerPriceSubtotal = cart.subtotal || 0;

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

  // Discount on MRP (offer discount = MRP - offer price)
  const offerDiscount = totalOriginalPrice - offerPriceSubtotal;
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

  // 2. Coupon Discount
  if (cart.coupon && cart.coupon.discountAmount > 0) {
    lines.push({
      key: "coupon_discount",
      label: `Coupon Discount (${cart.coupon.code})`,
      amount: -cart.coupon.discountAmount,
      type: "discount",
      order: 2,
    });
  }

  // 3. Shipping
  lines.push({
    key: "shipping",
    label: "Shipping",
    amount: cart.shippingEstimate || 0,
    type: "charge",
    estimated: true,
    order: 3,
  });

  // Compute payable from breakdown so coupon is always deducted (defense in depth)
  const couponDiscount = cart.coupon?.discountAmount || 0;
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
    appliedCoupon: cart.coupon
      ? {
          code: cart.coupon.code,
          discountAmount: cart.coupon.discountAmount,
          description: cart.coupon.description,
        }
      : null,
  };
};

module.exports = { formatCartResponse };
