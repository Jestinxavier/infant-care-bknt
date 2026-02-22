const Product = require("../../models/Product");
const Category = require("../../models/Category");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");
const {
  FILTER_ATTRIBUTE_KEYS,
  buildFilterAttributesQuery,
} = require("../../utils/filterAttributes");

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
    Object.assign(productFilter, buildFilterAttributesQuery(parsedFilters));

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

    // Extract filter data only from filterAttributes (denormalized search layer)
    const filterSets = FILTER_ATTRIBUTE_KEYS.reduce((acc, key) => {
      acc[key] = new Set();
      return acc;
    }, {});
    const filterColorHexMap = new Map();
    const prices = [];

    for (const product of products) {
      const productFilterAttributes =
        product.filterAttributes && typeof product.filterAttributes === "object"
          ? product.filterAttributes
          : {};

      FILTER_ATTRIBUTE_KEYS.forEach((key) => {
        const values = Array.isArray(productFilterAttributes[key])
          ? productFilterAttributes[key]
          : [];
        values.forEach((value) => {
          if (!value) return;
          filterSets[key].add(value);

          if (key === "color") {
            const colorHexFromUiMeta = getHexFromUiMeta(
              product.uiMeta?.color,
              value
            );
            const colorHexFromVariantOptions = getHexFromVariantOptions(
              product.variantOptions,
              value
            );
            const colorHex = colorHexFromUiMeta || colorHexFromVariantOptions;
            if (colorHex) {
              filterColorHexMap.set(normalizeValue(value), colorHex);
            }
          }
        });
      });

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
        continue;
      }

      for (const variant of product.variants) {
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

    // Generate raw filter data
    const rawFilters = {
      color: Array.from(filterSets.color).sort(),
      size: Array.from(filterSets.size).sort(),
      material: Array.from(filterSets.material).sort(),
      season: Array.from(filterSets.season).sort(),
      gender: Array.from(filterSets.gender).sort(),
      sleeve: Array.from(filterSets.sleeve).sort(),
      occasion: Array.from(filterSets.occasion).sort(),
      pattern: Array.from(filterSets.pattern).sort(),
      pack: Array.from(filterSets.pack).sort(),
      colorMeta: Object.fromEntries(filterColorHexMap),
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
