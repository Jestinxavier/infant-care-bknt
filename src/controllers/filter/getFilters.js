const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");

/**
 * Get filter options for a category (or all products)
 * Returns FilterConfig[] format ready for frontend
 */
const getFilters = async (req, res) => {
  try {
    const { slug } = req.params; // Category slug, or 'all' for all products

    // Build filter to get products for this category
    let productFilter = {};
    
    if (slug && slug !== "all") {
      // Find category by slug
      const categoryDoc = await Category.findOne({
        slug: slug,
        isActive: true,
      });
      
      if (!categoryDoc) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }
      
      productFilter.category = categoryDoc._id;
    }

    // Get all products for this category (for filter generation)
    const products = await Product.find(productFilter)
      .populate("category", "name slug")
      .lean();

    // Extract filter data from products and variants
    const filterColors = new Set();
    const filterSizes = new Set();
    const filterBrands = new Set();
    const prices = [];

    const productIds = products.map((p) => p._id);

    // Process new structure variants (embedded in products)
    for (const product of products) {
      // Also check parent product price if no variants
      if (!product.variants || product.variants.length === 0) {
        const parentPrice = product.pricing?.price || product.price || 0;
        const parentDiscountPrice = product.pricing?.discountPrice || product.discountPrice;
        const effectivePrice =
          parentDiscountPrice && parentDiscountPrice > 0
            ? parentDiscountPrice
            : parentPrice;
        if (effectivePrice && effectivePrice > 0) {
          prices.push(effectivePrice);
        }
      }
      
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          const variantAttrs = variant.attributes
            ? variant.attributes instanceof Map
              ? Object.fromEntries(variant.attributes)
              : variant.attributes
            : variant.options instanceof Map
            ? Object.fromEntries(variant.options)
            : variant.options || {};

          const variantColor = variantAttrs.color;
          const variantSize = variantAttrs.size || variantAttrs.age;

          if (variantColor) filterColors.add(variantColor);
          if (variantSize) filterSizes.add(variantSize);

          // Use effective price (discountPrice if available, otherwise regular price)
          const variantPrice = variant.pricing?.price || variant.price || 0;
          const variantDiscountPrice =
            variant.pricing?.discountPrice || variant.discountPrice;
          const effectivePrice =
            variantDiscountPrice && variantDiscountPrice > 0
              ? variantDiscountPrice
              : variantPrice;
          if (effectivePrice && effectivePrice > 0) {
            prices.push(effectivePrice);
          }
        }
      }

      // Extract brand from product details or tags
      if (product.details) {
        const brandDetail = product.details.find(
          (d) =>
            d.label?.toLowerCase() === "brand" ||
            d.label?.toLowerCase() === "manufacturer"
        );
        if (brandDetail?.value) filterBrands.add(brandDetail.value);
      }
      if (product.tags) {
        product.tags.forEach((tag) => {
          if (tag && tag.length > 0) {
            filterBrands.add(tag);
          }
        });
      }
    }

    // Process legacy variants (separate collection)
    if (productIds.length > 0) {
      const legacyVariants = await Variant.find({
        productId: { $in: productIds },
      }).lean();
      
      for (const variant of legacyVariants) {
        if (variant.color) filterColors.add(variant.color);
        if (variant.age) filterSizes.add(variant.age);
        // Use effective price for legacy variants too
        const variantPrice = variant.price || 0;
        const variantDiscountPrice = variant.discountPrice;
        const effectivePrice =
          variantDiscountPrice && variantDiscountPrice > 0
            ? variantDiscountPrice
            : variantPrice;
        if (effectivePrice && effectivePrice > 0) {
          prices.push(effectivePrice);
        }
      }
    }

    // Generate raw filter data
    const rawFilters = {
      color: Array.from(filterColors).sort(),
      size: Array.from(filterSizes).sort(),
      brand: Array.from(filterBrands).sort(),
      priceRange: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
    };

    // Transform to FilterConfig format
    const filters = generateFilterConfig(rawFilters);

    res.status(200).json({
      success: true,
      filters,
    });
  } catch (err) {
    console.error("❌ Error fetching filters:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getFilters;

