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
        images: item.productId.images || [],
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
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};

module.exports = { formatCartResponse };
