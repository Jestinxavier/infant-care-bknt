const Product = require("../../models/Product");
const Category = require("../../models/Category");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");
const {
  FILTER_ATTRIBUTE_KEYS,
  buildFilterAttributesQuery,
} = require("../../utils/filterAttributes");

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MIN_FUZZY_QUERY_LENGTH = 3;
const MIN_VARIANT_QUERY_LENGTH = 3;
const MAX_SEARCH_VARIANTS = 600;
const SEARCH_ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const COMMON_REPLACEMENTS = {
  b: ["p"],
  p: ["b"],
  d: ["t"],
  t: ["d"],
  m: ["n"],
  n: ["m"],
  c: ["k"],
  k: ["c"],
};
const SEARCH_TEXT_FIELDS = [
  "title",
  "name",
  "categoryName",
];
const SKU_SEARCH_FIELD = "variants.sku";

const normalizeValue = (value) => (value ?? "").toString().trim().toLowerCase();
const escapeRegexLiteral = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addPluralPair = (variants, term) => {
  if (!term || term.length < 4) return;

  if (term.endsWith("s") && !term.endsWith("ss")) {
    variants.add(term.slice(0, -1));
  } else if (!term.endsWith("s")) {
    variants.add(`${term}s`);
  }
};

const getReplacementCandidates = (char) => {
  const candidates = new Set();
  if (VOWELS.has(char)) {
    VOWELS.forEach((v) => {
      if (v !== char) candidates.add(v);
    });
  }

  (COMMON_REPLACEMENTS[char] || []).forEach((candidate) =>
    candidates.add(candidate)
  );

  return Array.from(candidates);
};

const buildSingleTermVariants = (term = "") => {
  const variants = new Set();
  const normalizedTerm = String(term).trim().toLowerCase();
  if (!normalizedTerm) return variants;

  variants.add(normalizedTerm);
  addPluralPair(variants, normalizedTerm);

  if (normalizedTerm.length < MIN_VARIANT_QUERY_LENGTH) {
    return variants;
  }

  const chars = normalizedTerm.split("");
  const push = (candidate) => {
    if (!candidate) return;
    if (variants.size >= MAX_SEARCH_VARIANTS) return;
    variants.add(candidate);
    addPluralPair(variants, candidate);
  };

  // Delete one char (handles accidental extra char)
  for (let i = 0; i < chars.length; i += 1) {
    push(`${normalizedTerm.slice(0, i)}${normalizedTerm.slice(i + 1)}`);
  }

  // Insert one char (handles missing-char typos)
  for (let i = 0; i <= chars.length; i += 1) {
    for (const letter of SEARCH_ALPHABET) {
      push(`${normalizedTerm.slice(0, i)}${letter}${normalizedTerm.slice(i)}`);
    }
  }

  // Swap adjacent chars (handles transposition typos)
  for (let i = 0; i < chars.length - 1; i += 1) {
    const swapped = [...chars];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    push(swapped.join(""));
  }

  // Replace one char using targeted common substitutions.
  for (let i = 0; i < chars.length; i += 1) {
    const candidates = getReplacementCandidates(chars[i]);
    for (const letter of candidates) {
      if (letter === chars[i]) continue;
      push(`${normalizedTerm.slice(0, i)}${letter}${normalizedTerm.slice(i + 1)}`);
    }
  }

  return variants;
};

const buildSearchVariants = (searchTerm = "") => {
  const normalized = String(searchTerm)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) return [];

  if (normalized.includes(" ")) {
    const variants = new Set([normalized]);
    addPluralPair(variants, normalized);
    return Array.from(variants).filter(Boolean);
  }

  return Array.from(buildSingleTermVariants(normalized)).filter(Boolean);
};

const buildFuzzySearchPattern = (searchTerm = "") => {
  const normalized = String(searchTerm).trim().toLowerCase();
  if (normalized.length < MIN_FUZZY_QUERY_LENGTH) return null;

  return normalized
    .split("")
    .map((char) => escapeRegexLiteral(char))
    .join(".{0,2}");
};

const tokenizeSearchTerm = (searchTerm = "") =>
  String(searchTerm)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const getSearchFields = (searchTerm = "") => {
  const raw = String(searchTerm || "");
  if (/[0-9-]/.test(raw)) {
    return [...SEARCH_TEXT_FIELDS, SKU_SEARCH_FIELD];
  }
  return SEARCH_TEXT_FIELDS;
};

const buildTokenRegex = (token, { includeFuzzy = false } = {}) => {
  const variants = buildSearchVariants(token);
  if (variants.length === 0) return null;

  const variantPattern = variants.map((term) => escapeRegexLiteral(term)).join("|");
  const patternParts = [`\\b(?:${variantPattern})`];

  if (includeFuzzy) {
    const fuzzyPattern = buildFuzzySearchPattern(token);
    if (fuzzyPattern) {
      patternParts.push(`\\b${fuzzyPattern}`);
    }
  }

  return {
    $regex: patternParts.join("|"),
    $options: "i",
  };
};

const buildSearchQuery = (searchTerm, { includeFuzzy = false } = {}) => {
  const tokens = tokenizeSearchTerm(searchTerm);
  if (tokens.length === 0) return null;
  const fields = getSearchFields(searchTerm);

  const tokenClauses = tokens
    .map((token) => {
      const tokenRegex = buildTokenRegex(token, { includeFuzzy });
      if (!tokenRegex) return null;

      return {
        $or: fields.map((field) => ({ [field]: tokenRegex })),
      };
    })
    .filter(Boolean);

  if (tokenClauses.length === 0) return null;
  if (tokenClauses.length === 1) return tokenClauses[0];

  return { $and: tokenClauses };
};

const applySearchFilter = (baseFilter, rawSearchTerm, useFuzzy = false) => {
  const filter = { ...baseFilter };
  const normalizedSearchTerm = String(rawSearchTerm || "").trim();
  if (!normalizedSearchTerm) return filter;

  const searchQuery = buildSearchQuery(normalizedSearchTerm, {
    includeFuzzy: !!useFuzzy,
  });

  if (searchQuery?.$or) {
    filter.$or = searchQuery.$or;
  } else if (searchQuery?.$and) {
    filter.$and = searchQuery.$and;
  }

  return filter;
};

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
    const rawSearchTerm = String(req.query.search || req.query.q || "").trim();

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

    let effectiveProductFilter = applySearchFilter(
      productFilter,
      rawSearchTerm,
      false
    );

    console.log("🛒 Product filter:", effectiveProductFilter);

    // Get all products for this category/search (for filter generation)
    let products = await Product.find(effectiveProductFilter)
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
    const categoryBaseFilter = { ...effectiveProductFilter };
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
