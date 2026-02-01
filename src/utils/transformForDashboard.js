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
      return (
        sum +
        (v.stockObj?.available !== undefined
          ? v.stockObj.available
          : v.stock || 0)
      );
    }, 0);
  }
  return product.stockObj?.available !== undefined
    ? product.stockObj.available
    : product.stock || 0;
}

/**
 * Calculate minimum price from variants or parent
 */
function calculateMinPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants
      .map((v) => v.pricing?.price || v.price || 0)
      .filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }
  const price =
    product.pricing?.price || product.price || product.basePrice || 0;
  return price > 0 ? price : null;
}

/**
 * Calculate maximum price from variants or parent
 */
function calculateMaxPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const prices = product.variants
      .map((v) => v.pricing?.price || v.price || 0)
      .filter((p) => p > 0);
    return prices.length > 0 ? Math.max(...prices) : null;
  }
  const price =
    product.pricing?.price || product.price || product.basePrice || 0;
  return price > 0 ? price : null;
}

/**
 * Get current price (prefer discountPrice, fallback to regular price)
 */
function getCurrentPrice(product) {
  if (product.variants && product.variants.length > 0) {
    const firstVariant = product.variants[0];
    return (
      firstVariant.pricing?.discountPrice ||
      firstVariant.discountPrice ||
      firstVariant.pricing?.price ||
      firstVariant.price ||
      0
    );
  }
  return (
    product.pricing?.discountPrice ||
    product.discountPrice ||
    product.pricing?.price ||
    product.price ||
    0
  );
}

/**
 * Get variant status based on stock
 */
function getVariantStatus(variant) {
  const stock =
    variant.stockObj?.available !== undefined
      ? variant.stockObj.available
      : variant.stock || 0;

  if (stock === 0) return "out_of_stock";
  if (stock < 10) return "low_stock";
  return "in_stock";
}

/**
 * Convert variant options/attributes to plain object
 */
function getVariantAttributes(variant) {
  if (variant.attributes && typeof variant.attributes === "object") {
    // If it's a Map, convert to object
    if (variant.attributes instanceof Map) {
      return Object.fromEntries(variant.attributes);
    }
    // If it's already an object
    if (
      typeof variant.attributes === "object" &&
      !Array.isArray(variant.attributes)
    ) {
      return variant.attributes;
    }
  }
  // Fallback to options (legacy format)
  if (variant.options && typeof variant.options === "object") {
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
    return `${parentTitle} - ${attrValues.join(" / ")}`;
  }
  return parentTitle;
}

/**
 * Build Cloudinary URL from public_id or asset path
 */
function buildCloudinaryUrl(publicIdOrPath) {
  if (!publicIdOrPath) return null;
  
  // If it's already a full URL, return as-is
  if (typeof publicIdOrPath === "string" && publicIdOrPath.startsWith("http")) {
    return publicIdOrPath;
  }

  // Handle "assets/" prefix - keep as "assets/" folder (CSV imported images)
  let publicId = publicIdOrPath;
  // Keep assets/ as-is since CSV images are stored in assets folder

  // Get Cloudinary config
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.warn("CLOUDINARY_CLOUD_NAME not set, cannot build URL");
    return publicIdOrPath; // Return original if config missing
  }

  // Build Cloudinary URL
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
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

  // Get thumbnail (prefer parent image, fallback to first variant image)
  const thumbnailRaw =
    product.images?.[0] ||
    (hasVariants ? product.variants[0]?.images?.[0] : null);
  
  // Convert thumbnail to full Cloudinary URL if it's an asset ID
  const thumbnail = thumbnailRaw ? buildCloudinaryUrl(thumbnailRaw) : null;

  // Get SKU (prefer parent SKU, fallback to first variant SKU)
  const sku = product.sku || (hasVariants ? product.variants[0]?.sku || null : null);

  // Get category name - prefer populated category, fallback to categoryName field
  let categoryName = product.categoryName;
  if (!categoryName && product.category) {
    if (typeof product.category === "object" && product.category.name) {
      categoryName = product.category.name;
    } else if (typeof product.category === "string") {
      categoryName = product.category;
    }
  }

  return {
    // Core product data
    _id: product._id?.toString(),
    title: product.title,
    categoryName: categoryName || null,
    url_key: product.url_key,
    status: product.status,

    // Stock metrics
    stock: totalStock,

    // Pricing - Keep only regular price and optional discount price
    price: minPrice, // Regular price (or min price for variants)
    discountPrice: product.pricing?.discountPrice || null, // Discount price if exists

    // Product Type
    product_type:
      product.product_type || (hasVariants ? "CONFIGURABLE" : "SIMPLE"),

    // Variants removed from list API - not needed for listing

    // Display fields
    thumbnail,
    sku,

    // Timestamps
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
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
  // Export for testing
  getVariantAttributes,
};
