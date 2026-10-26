const Product = require("../../models/Product");
const Category = require("../../models/Category");
const AttributeDefinition = require("../../models/AttributeDefinition");
const logger = require("../../utils/logger");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");
const {
  FILTER_ATTRIBUTE_KEYS,
  buildFilterAttributesQuery,
} = require("../../utils/filterAttributes");
const { normalizeFilterTokenByKey, deduplicateFilterValues } = require("../../utils/filterAttributeRules");
const {
  loadAttributeCatalogMap,
  resolveCatalogValueForAttribute,
} = require("../../utils/attributeCatalogGuard");
const { cacheGet, cacheSet, TTL } = require("../../utils/redisCache");

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

/**
 * Stock query mirroring the product listing's `isInStock` semantics so facet
 * counts match what the customer actually sees.
 *   inStock=true  → products with sellable stock.
 *   inStock=false → products with none of that (fully out of stock).
 * A CONFIGURABLE product is in stock when any variant has stock; a SIMPLE
 * product when its own stock is positive. `stockObj` (when present) wins over
 * the raw `stock` number, matching product.service.js.
 */
const buildInStockQuery = (inStock) => {
  const inStockConditions = [
    { "variants.stockObj.available": { $gt: 0 } },
    { "variants.stockObj.isInStock": true },
    { $and: [{ "variants.stockObj": { $exists: false } }, { "variants.stock": { $gt: 0 } }] },
    { $and: [{ variants: { $size: 0 } }, { "stockObj.available": { $gt: 0 } }] },
    { $and: [{ variants: { $size: 0 } }, { "stockObj.isInStock": true }] },
    {
      $and: [
        { variants: { $size: 0 } },
        { stockObj: { $exists: false } },
        { stock: { $gt: 0 } },
      ],
    },
  ];

  return inStock ? { $or: inStockConditions } : { $nor: inStockConditions };
};

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

const getHexFromAttributeCatalog = (colorHexMap, colorValue) => {
  if (!colorHexMap || typeof colorHexMap !== "object") return null;
  if (colorHexMap[colorValue] && HEX_COLOR_REGEX.test(colorHexMap[colorValue])) {
    return colorHexMap[colorValue];
  }

  const normalizedColor = normalizeValue(colorValue);
  for (const [value, hex] of Object.entries(colorHexMap)) {
    if (normalizeValue(value) === normalizedColor) {
      if (hex && HEX_COLOR_REGEX.test(hex)) return hex;
      break;
    }
  }

  return null;
};

const buildColorHexMapFromCatalog = (attribute) => {
  const map = {};
  if (!attribute || !Array.isArray(attribute.allowedValues)) return map;
  attribute.allowedValues.forEach((value) => {
    if (!value?.value || !value?.hex) return;
    if (HEX_COLOR_REGEX.test(value.hex)) map[value.value] = value.hex;
  });
  return map;
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

    // Cache the generated filter config per (slug + query) signature. Filter
    // generation scans every matching product, so this is the hottest and most
    // expensive part of category browsing. TTL is short (5 min) so new products
    // — which already flush the product cache on write — surface quickly.
    const filterCacheKey = `filters:config:${slug || "all"}:${JSON.stringify(
      Object.keys(req.query)
        .sort()
        .reduce((acc, k) => {
          acc[k] = req.query[k];
          return acc;
        }, {})
    )}`;
    const cachedFilters = await cacheGet(filterCacheKey);
    if (cachedFilters) {
      return res.status(200).json({ success: true, filters: cachedFilters });
    }

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
    let subCategoryDocs = [];
    let categoryScopeClause = null;

    if (selectedCategoryCodes.length > 0) {
      categoryDocs = await Category.find({
        $or: [
          { code: { $in: selectedCategoryCodes } },
          { slug: { $in: selectedCategoryCodes } }
        ],
        isActive: true,
      });

      if (categoryDocs.length === 0) {
        // Unknown category: return a real 404 so the storefront shows a
        // "not found" page instead of a full filter panel over every product.
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // Mirror the product listing (getProducts): selecting a parent also
      // covers its subcategories, and a product can be linked through either
      // `category` or `subCategories`. Previously only `category` was matched,
      // which left subcategory pages with no facets at all.
      const selectedIds = categoryDocs.map((d) => d._id);
      const childDocs = await Category.find({
        parentCategory: { $in: selectedIds },
        isActive: true,
      }).select("_id");
      const scopedCategoryIds = [...selectedIds, ...childDocs.map((d) => d._id)];

      categoryScopeClause = {
        $or: [
          { category: { $in: scopedCategoryIds } },
          { subCategories: { $in: scopedCategoryIds } },
        ],
      };
    }

    // A subcategory selected from the PLP facet must narrow BOTH the grid and
    // the facet counts — previously the listing narrowed but the counts stayed
    // at parent scope, the same mismatch class as the stock-count bug.
    const selectedSubCategoryCodes = [
      ...new Set(
        (Array.isArray(parsedFilters.subCategories)
          ? parsedFilters.subCategories
          : parsedFilters.subCategories
            ? [parsedFilters.subCategories]
            : []
        ).filter((c) => c && c !== "all")
      ),
    ];
    if (selectedSubCategoryCodes.length > 0) {
      subCategoryDocs = await Category.find({
        $or: [
          { code: { $in: selectedSubCategoryCodes } },
          { slug: { $in: selectedSubCategoryCodes } },
        ],
        isActive: true,
      });
      if (subCategoryDocs.length > 0) {
        productFilter.subCategories = {
          $in: subCategoryDocs.map((d) => d._id),
        };
      }
    }

    if (selectedCollectionSlugs.length > 0) {
      productFilter.collections = { $in: selectedCollectionSlugs };
    }
    Object.assign(productFilter, buildFilterAttributesQuery(parsedFilters));

    const effectiveProductFilter = applySearchFilter(
      productFilter,
      rawSearchTerm,
      false
    );

    // Applied AFTER the search filter (which overwrites `$and`) so it is never
    // clobbered. The clause is kept by reference so the category facet can be
    // computed from a wider, category-agnostic scope below.
    if (categoryScopeClause) {
      effectiveProductFilter.$and = [
        ...(effectiveProductFilter.$and || []),
        categoryScopeClause,
      ];
    }

    // Facet counts must reflect the SAME stock scope as the product listing,
    // otherwise a customer sees "Sky Blue (24)" but only 11 products appear.
    // The listing defaults to in-stock only; mirror that here (honouring an
    // explicit inStock=false). Out-of-stock products never surface in the
    // default grid, so they must not inflate the counts. Applied AFTER the
    // search filter (which may set its own $and) so it is never clobbered.
    const inStock = parsedFilters.inStock === "false" ? false : true;
    effectiveProductFilter.$and = [
      ...(effectiveProductFilter.$and || []),
      buildInStockQuery(inStock),
    ];

    // Get all products for this category/search (for filter generation).
    // Only the fields the facet builder reads are projected — the previous
    // version loaded every product document (all images, descriptions, SEO,
    // etc.) plus a category populate across the whole matching set on every
    // request, which is very expensive for broad categories.
    const products = await Product.find(effectiveProductFilter)
      .select(
        "filterAttributes variantOptions variants.price variants.offerPrice variants.offerStartAt variants.offerEndAt variants.stock variants.stockObj stock stockObj price offerPrice offerStartAt offerEndAt category subCategories"
      )
      .lean();

    // Extract filter data only from filterAttributes (denormalized search layer)
    // CountMap tracks how many products have each normalized filter value
    const filterCountMaps = FILTER_ATTRIBUTE_KEYS.reduce((acc, key) => {
      acc[key] = new Map();
      return acc;
    }, {});
    const filterColorHexMap = new Map();
    const prices = [];

    // Color swatch hex comes from the global attribute catalog (source of
    // truth), not from per-product uiMeta. Variant option hex is kept as a
    // legacy fallback only.
    const colorAttribute = await AttributeDefinition.findOne({ code: "color" })
      .select("allowedValues")
      .lean();
    const catalogColorHexMap = buildColorHexMapFromCatalog(colorAttribute);

    // The full attribute catalogue is the single source of truth for which
    // facet values are allowed to appear. A product value that does not resolve
    // to a registered value (e.g. stale raw tokens like "m"/"s", or a material
    // value that leaked into gender) is skipped here so it can never surface as
    // a phantom facet. Values with no AttributeDefinition at all keep legacy
    // tolerance (catalogue unavailable → don't hide anything).
    const catalogMap = await loadAttributeCatalogMap();

    for (const product of products) {
      const productFilterAttributes =
        product.filterAttributes && typeof product.filterAttributes === "object"
          ? product.filterAttributes
          : {};

      FILTER_ATTRIBUTE_KEYS.forEach((key) => {
        const values = Array.isArray(productFilterAttributes[key])
          ? productFilterAttributes[key]
          : [];
        const attributeDef = catalogMap.get(key);
        values.forEach((value) => {
          if (!value) return;
          // Facet-layer enforcement: only registered values become facets.
          if (
            attributeDef &&
            !resolveCatalogValueForAttribute(attributeDef, value)
          ) {
            return;
          }
          const normalized = normalizeFilterTokenByKey(key, value);
          if (!normalized) return;
          const countMap = filterCountMaps[key];
          countMap.set(normalized, (countMap.get(normalized) || 0) + 1);

          if (key === "color") {
            const colorHexFromCatalog = getHexFromAttributeCatalog(
              catalogColorHexMap,
              value
            );
            const colorHexFromVariantOptions = getHexFromVariantOptions(
              product.variantOptions,
              value
            );
            const colorHex = colorHexFromCatalog || colorHexFromVariantOptions;
            if (colorHex) {
              filterColorHexMap.set(normalized, colorHex);
            }
          }
        });
      });

      if (!product.variants || product.variants.length === 0) {
        const parentPrice = product.price || 0;
        const parentOfferPrice = product.offerPrice;
        const now = new Date();
        const offerValid =
          parentOfferPrice > 0 &&
          (!product.offerStartAt || new Date(product.offerStartAt) <= now) &&
          (!product.offerEndAt || new Date(product.offerEndAt) >= now);
        const effectivePrice = offerValid ? parentOfferPrice : parentPrice;
        if (effectivePrice > 0) {
          prices.push(effectivePrice);
        }
        continue;
      }

      for (const variant of product.variants) {
        const variantPrice = variant.price || 0;
        const variantOfferPrice = variant.offerPrice;
        const now = new Date();
        const offerValid =
          variantOfferPrice > 0 &&
          (!variant.offerStartAt || new Date(variant.offerStartAt) <= now) &&
          (!variant.offerEndAt || new Date(variant.offerEndAt) >= now);
        const effectivePrice = offerValid ? variantOfferPrice : variantPrice;
        if (effectivePrice > 0) {
          prices.push(effectivePrice);
        }
      }
    }

    // Generate raw filter data — deduplicate by normalized slug with counts
    const buildCountArray = (key) => {
      const countMap = filterCountMaps[key];
      const deduped = deduplicateFilterValues(key, Array.from(countMap.keys()));
      return deduped.map((value) => ({ value, count: countMap.get(value) || 0 }));
    };

    const rawFilters = {
      color: buildCountArray("color"),
      size: buildCountArray("size"),
      material: buildCountArray("material"),
      season: buildCountArray("season"),
      gender: buildCountArray("gender"),
      sleeve: buildCountArray("sleeve"),
      occasion: buildCountArray("occasion"),
      pattern: buildCountArray("pattern"),
      pack: buildCountArray("pack"),
      colorMeta: Object.fromEntries(filterColorHexMap),
      priceRange: {
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      },
    };

    // Per-category facet allowlist. When the selected category(ies) declare
    // which filter groups apply (Category.filterAttributes), hide every other
    // facet group. A subcategory inherits its parent's allowlist when it has
    // none of its own (all subcategories are currently unconfigured). A
    // category with no allowlist anywhere keeps all groups (backward
    // compatible). The union across selected categories is used so multi-select
    // never hides a relevant group.
    const allowlistDocs = [...categoryDocs, ...subCategoryDocs];
    if (allowlistDocs.length > 0) {
      const parentIds = [
        ...new Set(
          allowlistDocs
            .filter((cat) => cat.parentCategory)
            .map((cat) => String(cat.parentCategory))
        ),
      ];
      const parentDocs = parentIds.length
        ? await Category.find({ _id: { $in: parentIds } })
            .select("filterAttributes")
            .lean()
        : [];
      const parentMap = new Map(parentDocs.map((p) => [String(p._id), p]));

      const allowSet = new Set();
      let anyConfigured = false;
      allowlistDocs.forEach((cat) => {
        let configured = Array.isArray(cat.filterAttributes)
          ? cat.filterAttributes
          : [];
        if (configured.length === 0 && cat.parentCategory) {
          const parent = parentMap.get(String(cat.parentCategory));
          configured =
            parent && Array.isArray(parent.filterAttributes)
              ? parent.filterAttributes
              : [];
        }
        if (configured.length > 0) {
          anyConfigured = true;
          configured.forEach((k) => allowSet.add(String(k).toLowerCase()));
        }
      });
      if (anyConfigured) {
        FILTER_ATTRIBUTE_KEYS.forEach((key) => {
          if (!allowSet.has(key)) rawFilters[key] = [];
        });
      }
    }

    // To allow multi-select, identify parent categories that match other filters (price, color, etc.)
    // The category scope lives inside `$and` (see categoryScopeClause) so it
    // must be removed explicitly here; deleting only `category`/`subCategories`
    // would leave the scope in place and make the Category facet self-limiting.
    const categoryBaseFilter = {
      ...effectiveProductFilter,
      $and: (effectiveProductFilter.$and || []).filter(
        (clause) => clause !== categoryScopeClause
      ),
    };
    if (categoryBaseFilter.$and && categoryBaseFilter.$and.length === 0) {
      delete categoryBaseFilter.$and;
    }
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

    // The Category facet is a cross-category navigation aid — it only makes
    // sense on the "all products" listing. On a specific category page (slug
    // or ?category= present) it is redundant (navigation lives in the nav /
    // breadcrumb) and previously listed every category with none selected.
    if (relevantParents.length > 0 && selectedCategoryCodes.length === 0) {
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

        // Only offer subcategories that actually have products in the current
        // result scope — an empty option leads straight to a dead-end page.
        const relevantSubcategories = activeSubcategories.filter((cat) =>
          allRefCatIds.has(String(cat._id))
        );

        if (relevantSubcategories.length > 0) {
          rawFilters.subCategories = relevantSubcategories.map(cat => ({
            value: cat.code,
            label: cat.name
          }));
        }
      }
    }

    // Transform to FilterConfig format
    const filters = generateFilterConfig(rawFilters);

    await cacheSet(filterCacheKey, filters, TTL.DASHBOARD);

    res.status(200).json({
      success: true,
      filters,
    });
  } catch (err) {
    logger.error("❌ Error fetching filters:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = getFilters;
