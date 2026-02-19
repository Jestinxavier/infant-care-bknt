const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const Category = require("../../models/Category");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const normalizeValue = (value) => (value ?? "").toString().trim().toLowerCase();

const getHexFromUiMeta = (uiMetaColors, colorValue) => {
  if (!uiMetaColors || typeof uiMetaColors !== "object") return null;

  const directMeta = uiMetaColors[colorValue];
  if (directMeta?.hex && HEX_COLOR_REGEX.test(directMeta.hex)) {
    return directMeta.hex;
  }

  const normalizedColor = normalizeValue(colorValue);
  for (const [key, meta] of Object.entries(uiMetaColors)) {
    if (normalizeValue(key) === normalizedColor) {
      if (meta?.hex && HEX_COLOR_REGEX.test(meta.hex)) {
        return meta.hex;
      }
      break;
    }
  }

  return null;
};

const getHexFromVariantOptions = (variantOptions, colorValue) => {
  if (!Array.isArray(variantOptions)) return null;

  const colorOption = variantOptions.find(
    (option) =>
      normalizeValue(option?.code) === "color" ||
      normalizeValue(option?.name) === "color"
  );
  if (!colorOption || !Array.isArray(colorOption.values)) return null;

  const normalizedColor = normalizeValue(colorValue);
  const matchingValue = colorOption.values.find((optionValue) => {
    const valueMatch =
      normalizeValue(optionValue?.value) === normalizedColor ||
      normalizeValue(optionValue?.label) === normalizedColor;
    return valueMatch;
  });

  if (matchingValue?.hex && HEX_COLOR_REGEX.test(matchingValue.hex)) {
    return matchingValue.hex;
  }

  return null;
};

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
    const collectionFromQuery = parsedFilters.collection;
    let selectedCategoryCodes = [];
    let selectedCollectionSlugs = [];

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
    if (collectionFromQuery) {
      if (Array.isArray(collectionFromQuery)) {
        selectedCollectionSlugs.push(...collectionFromQuery);
      } else {
        selectedCollectionSlugs.push(collectionFromQuery);
      }
    }

    // Remove duplicates and 'all'
    selectedCategoryCodes = [...new Set(selectedCategoryCodes)].filter(c => c && c !== "all");
    selectedCollectionSlugs = [...new Set(selectedCollectionSlugs)].filter(
      (c) => c && c !== "all"
    );

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
    if (selectedCollectionSlugs.length > 0) {
      productFilter.collections = { $in: selectedCollectionSlugs };
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
    const filterColorHexMap = new Map();
    const filterSizes = new Set();
    const filterBrands = new Set();
    const prices = [];

    const productIds = products.map((p) => p._id);
    const productsById = new Map(products.map((product) => [String(product._id), product]));

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

          if (variantColor) {
            filterColors.add(variantColor);

            const colorHexFromUiMeta = getHexFromUiMeta(
              product.uiMeta?.color,
              variantColor
            );
            const colorHexFromVariantOptions = getHexFromVariantOptions(
              product.variantOptions,
              variantColor
            );
            const colorHex = colorHexFromUiMeta || colorHexFromVariantOptions;

            if (colorHex) {
              filterColorHexMap.set(normalizeValue(variantColor), colorHex);
            }
          }
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

      // Extract brand from product details
      if (product.details) {
        const brandDetail = product.details.find(
          (d) =>
            d.label?.toLowerCase() === "brand" ||
            d.label?.toLowerCase() === "manufacturer"
        );
        if (brandDetail?.value) filterBrands.add(brandDetail.value);
      }
    }

    // Process legacy variants (separate collection)
    if (productIds.length > 0) {
      const legacyVariants = await Variant.find({
        productId: { $in: productIds },
      }).lean();

      for (const variant of legacyVariants) {
        if (variant.color) {
          filterColors.add(variant.color);

          const parentProduct = productsById.get(String(variant.productId));
          const colorHexFromUiMeta = getHexFromUiMeta(
            parentProduct?.uiMeta?.color,
            variant.color
          );
          const colorHexFromVariantOptions = getHexFromVariantOptions(
            parentProduct?.variantOptions,
            variant.color
          );
          const colorHex = colorHexFromUiMeta || colorHexFromVariantOptions;

          if (colorHex) {
            filterColorHexMap.set(normalizeValue(variant.color), colorHex);
          }
        }
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
      colorMeta: Object.fromEntries(filterColorHexMap),
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
