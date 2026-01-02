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
    // Support both URL path param (/filter/:slug) and query param (/filter/all?category=xxx)
    const slug = req.params.slug;
    const { parseQueryFilters } = require("../../utils/parseQueryFilters");
    const parsedFilters = parseQueryFilters(req.query);

    // Use query param and slug to get all selected category codes
    const categoryFromQuery = parsedFilters.category;
    let selectedCategoryCodes = [];

    if (slug && slug !== "all") {
      selectedCategoryCodes.push(slug);
    }

    if (categoryFromQuery) {
      if (Array.isArray(categoryFromQuery)) {
        selectedCategoryCodes.push(...categoryFromQuery);
      } else {
        selectedCategoryCodes.push(categoryFromQuery);
      }
    }

    // Remove duplicates and 'all'
    selectedCategoryCodes = [...new Set(selectedCategoryCodes)].filter(c => c && c !== "all");

    // Build filter to get products for these categories (for filter generation)
    let productFilter = { status: "published" };
    let categoryDocs = [];

    if (selectedCategoryCodes.length > 0) {
      categoryDocs = await Category.find({
        $or: [
          { code: { $in: selectedCategoryCodes } },
          { slug: { $in: selectedCategoryCodes } }
        ],
        isActive: true,
      });

      if (categoryDocs.length > 0) {
        productFilter.category = { $in: categoryDocs.map(d => d._id) };
      }
    }

    console.log("🛒 Product filter:", productFilter);

    // Get all products for this category (for filter generation)
    const products = await Product.find(productFilter)
      .populate("category", "name slug code")
      .lean();

    console.log(`📦 Found ${products.length} products for filter generation`);
    if (products.length > 0) {
      products.forEach((p, i) => {
        console.log(
          `  Product ${i + 1}: ${p.title || p.name}, Variants: ${p.variants?.length || 0
          }`
        );
      });
    }

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
        const parentDiscountPrice =
          product.pricing?.discountPrice || product.discountPrice;
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
        // Tags is now a string (single value or comma-separated)
        const tagValue = product.tags;
        if (typeof tagValue === "string" && tagValue.length > 0) {
          // Split by comma if multiple tags, otherwise use as-is
          const tagList = tagValue.includes(",")
            ? tagValue
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
            : [tagValue.trim()];
          tagList.forEach((tag) => {
            if (tag.length > 0) {
              filterBrands.add(tag);
            }
          });
        } else if (Array.isArray(tagValue)) {
          // Legacy support for array format
          tagValue.forEach((tag) => {
            if (tag && tag.length > 0) {
              filterBrands.add(tag);
            }
          });
        }
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

    // To allow multi-select, identify parent categories that match other filters (price, color, etc.)
    const categoryBaseFilter = { ...productFilter };
    delete categoryBaseFilter.category;
    delete categoryBaseFilter.subCategories;

    const [productCatIds, productSubCatIds] = await Promise.all([
      Product.distinct("category", categoryBaseFilter),
      Product.distinct("subCategories", categoryBaseFilter)
    ]);

    const allRefCatIds = new Set([...productCatIds.map(id => id.toString()), ...productSubCatIds.map(id => id.toString())]);

    // To show parents, we need parents of both category and subCategories found
    const parentCategoryIdsSet = new Set();

    if (allRefCatIds.size > 0) {
      const referencedCats = await Category.find({ _id: { $in: Array.from(allRefCatIds) } }).lean();
      referencedCats.forEach(cat => {
        if (cat.parentCategory) {
          parentCategoryIdsSet.add(cat.parentCategory.toString());
        } else {
          parentCategoryIdsSet.add(cat._id.toString());
        }
      });
    }

    // Now find only the PARENT categories from the relevant set
    const relevantParents = await Category.find({
      _id: { $in: Array.from(parentCategoryIdsSet) },
      isActive: true,
      parentCategory: null
    }).sort({ displayOrder: 1 }).lean();

    if (relevantParents.length > 0) {
      rawFilters.categories = relevantParents.map(cat => ({
        value: cat.code,
        label: cat.name
      }));
    }

    // Show subcategories if any parent categories are selected (via slug or query)
    if (selectedCategoryCodes.length > 0) {
      // Find the parent categories that are currently selected
      const selectedParents = await Category.find({
        $or: [
          { code: { $in: selectedCategoryCodes } },
          { slug: { $in: selectedCategoryCodes } }
        ],
        isActive: true,
        parentCategory: null // Only look for parent categories here
      }).lean();

      if (selectedParents.length > 0) {
        const parentIds = selectedParents.map(p => p._id);

        // Find all active subcategories for these parents
        const activeSubcategories = await Category.find({
          parentCategory: { $in: parentIds },
          isActive: true
        }).sort({ displayOrder: 1 }).lean();

        if (activeSubcategories.length > 0) {
          rawFilters.subCategories = activeSubcategories.map(cat => ({
            value: cat.code,
            label: cat.name
          }));
        }
      }
    }

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
