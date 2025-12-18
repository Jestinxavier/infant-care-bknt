/**
 * Transform product data for admin dashboard listing
 * Adds aggregated metrics and variant summaries
 */

/**
 * Calculate total stock from variants or parent
 */
function calculateTotalStock(product) {
  if (product.variants && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => {
      return sum + (v.stockObj?.available !== undefined
        ? v.stockObj.available
        : (v.stock || 0));
    }, 0);
  }
  return product.stockObj?.available !== undefined
    ? product.stockObj.available
    : (product.stock || 0);
}

/**
 * Calculate minimum price from variants or parent
 */
function calculateMinPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants
      .map(v => v.pricing?.price || v.price || 0)
      .filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }
  const price = product.pricing?.price || product.price || product.basePrice || 0;
  return price > 0 ? price : null;
}

/**
 * Calculate maximum price from variants or parent
 */
function calculateMaxPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants
      .map(v => v.pricing?.price || v.price || 0)
      .filter(p => p > 0);
    return prices.length > 0 ? Math.max(...prices) : null;
  }
  const price = product.pricing?.price || product.price || product.basePrice || 0;
  return price > 0 ? price : null;
}

/**
 * Get current price (prefer discountPrice, fallback to regular price)
 */
function getCurrentPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const firstVariant = product.variants[0];
    return firstVariant.pricing?.discountPrice ||
      firstVariant.discountPrice ||
      firstVariant.pricing?.price ||
      firstVariant.price ||
      0;
  }
  return product.pricing?.discountPrice ||
    product.discountPrice ||
    product.pricing?.price ||
    product.price ||
    0;
}

/**
 * Get variant status based on stock
 */
function getVariantStatus(variant) {
  const stock = variant.stockObj?.available !== undefined
    ? variant.stockObj.available
    : (variant.stock || 0);

  if (stock === 0) return "out_of_stock";
  if (stock < 10) return "low_stock";
  return "in_stock";
}

/**
 * Convert variant options/attributes to plain object
 */
function getVariantAttributes(variant) {
  if (variant.attributes && typeof variant.attributes === 'object') {
    // If it's a Map, convert to object
    if (variant.attributes instanceof Map) {
      return Object.fromEntries(variant.attributes);
    }
    // If it's already an object
    if (typeof variant.attributes === 'object' && !Array.isArray(variant.attributes)) {
      return variant.attributes;
    }
  }
  // Fallback to options (legacy format)
  if (variant.options && typeof variant.options === 'object') {
    if (variant.options instanceof Map) {
      return Object.fromEntries(variant.options);
    }
    return variant.options;
  }
  return {};
}

/**
 * Build variant title from attributes
 */
function buildVariantTitle(parentTitle, attributes) {
  const attrValues = Object.values(attributes || {});
  if (attrValues.length > 0) {
    return `${parentTitle} - ${attrValues.join(' / ')}`;
  }
  return parentTitle;
}

/**
 * Transform product for admin dashboard listing
 * @param {Object} product - Raw product from database
 * @returns {Object} Transformed product with aggregated metrics
 */
function transformForDashboard(product) {
  const hasVariants = product.variants && product.variants.length > 0;

  // Calculate aggregated metrics
  const totalStock = calculateTotalStock(product);
  const minPrice = calculateMinPrice(product);
  const maxPrice = calculateMaxPrice(product);
  const currentPrice = getCurrentPrice(product);

  // Get thumbnail (prefer parent image, fallback to first variant image)
  const thumbnail = product.images?.[0] ||
    (hasVariants ? product.variants[0]?.images?.[0] : null);

  // Get SKU (prefer first variant SKU, fallback to parent SKU)
  const sku = hasVariants
    ? (product.variants[0]?.sku || null)
    : (product.sku || null);

  // Build variant summary for expandable rows
  const variantSummary = hasVariants
    ? product.variants.map(v => {
      const attributes = getVariantAttributes(v);
      return {
        id: v.id,
        sku: v.sku,
        attributes,
        title: buildVariantTitle(product.title, attributes),
        price: v.pricing?.price || v.price || 0,
        discountPrice: v.pricing?.discountPrice || v.discountPrice || null,
        stock: v.stockObj?.available !== undefined
          ? v.stockObj.available
          : (v.stock || 0),
        status: getVariantStatus(v),
        image: v.images?.[0] || product.images?.[0] || null,
        url_key: v.url_key || null,
      };
    })
    : [];

  return {
    // Core product data
    _id: product._id?.toString(),
    id: product._id?.toString(), // Alias for compatibility
    title: product.title,
    name: product.name || product.title, // Legacy compatibility
    description: product.description,
    category: product.category,
    categoryName: product.categoryName,
    url_key: product.url_key,
    status: product.status,

    // Aggregated metrics
    totalStock,
    stock: totalStock, // Aliased for compatibility
    minPrice,
    maxPrice,
    variantCount: product.variants?.length || 0,

    // Display fields
    thumbnail,
    imageUrl: thumbnail, // Legacy compatibility
    images: product.images || [],
    sku,
    currentPrice,
    price: currentPrice, // Legacy compatibility

    // Variant summary (for expandable rows in table)
    variants: variantSummary,

    // Full variant data (for detail page - keep original structure)
    fullVariants: product.variants || [],

    // Additional metadata
    variantOptions: product.variantOptions || [],
    details: product.details || [],
    averageRating: product.averageRating || 0,
    totalReviews: product.totalReviews || 0,
    discountable: product.discountable !== false,
    is_giftcard: product.is_giftcard || false,

    // Timestamps
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    created_at: product.createdAt, // Legacy compatibility
    updated_at: product.updatedAt, // Legacy compatibility
  };
}

module.exports = {
  transformForDashboard,
  calculateTotalStock,
  calculateMinPrice,
  calculateMaxPrice,
  getCurrentPrice,
  getVariantStatus,
  buildVariantTitle,
};

