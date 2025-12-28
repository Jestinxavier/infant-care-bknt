// utils/formatCartResponse.js

/**
 * Format cart response - ensures MongoDB _id is never exposed
 * Only cartId is exposed, never the cart document's MongoDB _id
 */
const formatCartResponse = (cart) => {
  if (!cart) return null;

  // Format items - item._id is the embedded document ID (needed for updates/deletes)
  const formattedItems = cart.items.map((item) => {
    const itemObj = {
      _id: item._id.toString(), // Item ID (embedded document ID, needed for updates)
      productId: item.productId?._id
        ? item.productId._id.toString()
        : item.productId.toString(),
      variantId: item.variantId || null,
      quantity: item.quantity,
      priceSnapshot: item.priceSnapshot,
      discountPriceSnapshot: item.discountPriceSnapshot || null,
      titleSnapshot: item.titleSnapshot,
      imageSnapshot: item.imageSnapshot,
      skuSnapshot: item.skuSnapshot || null,
      attributesSnapshot: item.attributesSnapshot
        ? Object.fromEntries(item.attributesSnapshot)
        : null,
    };

    // Include populated product data if available
    if (item.productId?._id) {
      itemObj.product = {
        _id: item.productId._id.toString(),
        title: item.productId.title,
        url_key: item.productId.url_key,
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
                      const matches = [...img.matchAll(/'\d+':\s*'([^'])'/g)];
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
  const subtotal = cart.subtotal || 0;

  // 1. Subtotal
  lines.push({
    key: "items_subtotal",
    label: "Subtotal",
    amount: subtotal,
    type: "base",
    order: 1,
  });

  // Calculate product level discount (MRP - Selling Price)
  const sellingPriceTotal = formattedItems.reduce((sum, item) => {
    const price = item.discountPriceSnapshot || item.priceSnapshot;
    return sum + price * item.quantity;
  }, 0);

  const productDiscount = subtotal - sellingPriceTotal;

  if (productDiscount > 0) {
    lines.push({
      key: "discount_on_mrp",
      label: "Discount on MRP",
      amount: -productDiscount,
      type: "discount",
      order: 1.5,
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

  return {
    currency: "INR",
    lines: lines,
    payable: {
      label: "Total Payable",
      amount: cart.total || 0,
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
