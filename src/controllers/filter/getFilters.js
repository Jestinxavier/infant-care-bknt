const mongoose = require("mongoose");
const Product = require("../../models/Product");
const Category = require("../../models/Category");
const AttributeDefinition = require("../../models/AttributeDefinition");
const logger = require("../../utils/logger");
const { generateFilterConfig } = require("../../utils/generateFilterConfig");
const {
  FILTER_ATTRIBUTE_KEYS,
  buildFilterAttributesQuery,
  normalizeFilterArray,
} = require("../../utils/filterAttributes");
const { normalizeFilterTokenByKey, deduplicateFilterValues } = require("../../utils/filterAttributeRules");
const {
  loadAttributeCatalogMap,
  resolveCatalogValueForAttribute,
} = require("../../utils/attributeCatalogGuard");
const { cacheGet, cacheSet, TTL } = require("../../utils/redisCache");
const {
  buildSkuPrefixClauses,
  findExactSkuProductIds,
} = require("../../utils/skuSearch");
const {
  tokenizeSearchTerm,
  buildTokenRegex,
  buildExtraTokenClauses,
  applySearchIntentFilters,
} = require("../../utils/searchTerms");
const { findSearchProductIds } = require("../../services/productSearchService");
const { buildInStockQuery } = require("../../utils/stockQuery");
const {
  getSelectedVariantFilters,
  getVariantValue,
  variantMatchesFilters,
  isVariantInStock,
} = require("../../utils/variantFilterMatch");

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SEARCH_TEXT_FIELDS = [
  "title",
  "name",
  "categoryName",
];

const normalizeValue = (value) => (value ?? "").toString().trim().toLowerCase();


const buildSearchQuery = (searchTerm, { includeFuzzy = false } = {}) => {
  const tokens = tokenizeSearchTerm(searchTerm);
  if (tokens.length === 0) return null;

  const tokenClauses = tokens
    .map((token) => {
      const tokenRegex = buildTokenRegex(token, { includeFuzzy });
      if (!tokenRegex) return null;

      // Mirrors product.service buildSearchQuery: SKU leg is a plain prefix.
      const clauses = [
        ...SEARCH_TEXT_FIELDS.map((field) => ({ [field]: tokenRegex })),
        ...buildExtraTokenClauses(token),
      ];
      if (/[0-9-]/.test(token)) clauses.push(...buildSkuPrefixClauses(token));
      return { $or: clauses };
    })
    .filter(Boolean);

  if (tokenClauses.length === 0) return null;
  if (tokenClauses.length === 1) return tokenClauses[0];

  return { $and: tokenClauses };
};

/**
 * Narrows the facet query to the products the search listing shows for this
 * term: Meilisearch ids when available, otherwise the same regex search.
 * Words that the listing turns into filters ("girls", "pack of 2") are left
 * out of the text, as in the listing; the caller applies them as filters.
 */
const applySearchFilter = async (baseFilter, rawSearchTerm, useFuzzy = false) => {
  const filter = { ...baseFilter };
  const normalizedSearchTerm = String(
    applySearchIntentFilters({ search: rawSearchTerm }).search || ""
  ).trim();
  if (!normalizedSearchTerm) return filter;

  const searchIds = await findSearchProductIds(normalizedSearchTerm);
  if (searchIds) {
    filter._id = { $in: searchIds.map((id) => new mongoose.Types.ObjectId(id)) };
    return filter;
  }

  const searchQuery = buildSearchQuery(normalizedSearchTerm, {
    includeFuzzy: !!useFuzzy,
  });

  if (searchQuery) {
    filter.$and = [...(filter.$and || []), searchQuery];
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
    // Exact SKU → facets for exactly that product (mirrors the listing).
    const exactSkuIds = await findExactSkuProductIds(rawSearchTerm);
    const isExactSkuSearch = exactSkuIds.length > 0;

    // As in the listing, search words such as "girls" or "pack of 2" act as
    // filters (gender: girl, pack: pack-of-2), so the counts include them.
    const attributeFilters = isExactSkuSearch
      ? parsedFilters
      : applySearchIntentFilters({ ...parsedFilters, search: rawSearchTerm });

    // Facet counts follow the shopper's other selections: each group is
    // counted with every selection applied EXCEPT its own (so picking "Blue"
    // updates the size/material counts, while the Color group still lists the
    // other colours for multi-select). The shopper's own picks are therefore
    // applied per group in the loop below, not in the database query. Values
    // that come only from the search words ("girls" → gender: girl) always
    // apply, as in the listing, so they stay in the query.
    const userSelectedKeys = new Set(
      FILTER_ATTRIBUTE_KEYS.filter(
        (key) =>
          Object.prototype.hasOwnProperty.call(parsedFilters, key) &&
          normalizeFilterArray(parsedFilters[key], key).length > 0
      )
    );
    const searchOnlyAttributeFilters = Object.fromEntries(
      Object.entries(attributeFilters).filter(([key]) => !userSelectedKeys.has(key))
    );
    Object.assign(productFilter, buildFilterAttributesQuery(searchOnlyAttributeFilters));

    const effectiveProductFilter = isExactSkuSearch
      ? { ...productFilter, _id: { $in: exactSkuIds } }
      : await applySearchFilter(productFilter, rawSearchTerm, false);

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
    // Exception, as in the listing: an exact-SKU search shows the product
    // even when sold out unless the shopper explicitly picked a stock filter.
    const inStock = parsedFilters.inStock === "false" ? false : true;
    const applyStockScope = !(isExactSkuSearch && parsedFilters.inStock === undefined);
    if (applyStockScope) {
      effectiveProductFilter.$and = [
        ...(effectiveProductFilter.$and || []),
        // Out of stock: configurable products are judged per matching variant
        // below (as the listing does), not as "every variant sold out".
        inStock
          ? buildInStockQuery(true)
          : { $or: [{ product_type: "CONFIGURABLE" }, buildInStockQuery(false)] },
      ];
    }
    // Every selection (shopper's picks + search words), for variant matching.
    const selectedVariantFilters = getSelectedVariantFilters(attributeFilters);
    // The shopper's own picks — the ones a group leaves out when counting itself.
    const userKeys = Object.keys(selectedVariantFilters).filter((key) =>
      userSelectedKeys.has(key)
    );
    // Product-level match (filterAttributes), as the listing's query does.
    const productHasSelected = (attrs, key) => {
      const values = Array.isArray(attrs[key]) ? attrs[key] : [attrs[key]];
      return values.some(
        (value) =>
          value != null &&
          selectedVariantFilters[key].has(normalizeFilterTokenByKey(key, value))
      );
    };
    const productMatchesExcept = (attrs, exceptKey) =>
      userKeys.every((key) => key === exceptKey || productHasSelected(attrs, key));

    // Get all products for this category/search (for filter generation).
    // Only the fields the facet builder reads are projected — the previous
    // version loaded every product document (all images, descriptions, SEO,
    // etc.) plus a category populate across the whole matching set on every
    // request, which is very expensive for broad categories.
    const products = await Product.find(effectiveProductFilter)
      .select(
        "product_type filterAttributes variantOptions variants.price variants.offerPrice variants.offerStartAt variants.offerEndAt variants.stock variants.stockObj variants.attributes variants.options stock stockObj price offerPrice offerStartAt offerEndAt category subCategories"
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

    // Effective price exactly as the listing computes it: a live offer price,
    // else the regular price (variant-level for configurable products).
    const now = new Date();
    const effectivePriceOf = (item) => {
      const offer = item.offerPrice;
      const offerValid =
        offer > 0 &&
        (!item.offerStartAt || new Date(item.offerStartAt) <= now) &&
        (!item.offerEndAt || new Date(item.offerEndAt) >= now);
      return offerValid ? offer : item.price || 0;
    };
    // The listing ignores a 0/empty bound (truthy check), so do the same.
    const minPrice = parsedFilters.minPrice ? Number(parsedFilters.minPrice) : null;
    const maxPrice = parsedFilters.maxPrice ? Number(parsedFilters.maxPrice) : null;
    const priceInRange = (item) => {
      const price = effectivePriceOf(item);
      return (minPrice === null || price >= minPrice) && (maxPrice === null || price <= maxPrice);
    };

    // In stock: a matching variant has stock. Out of stock: matching variants
    // exist and none has stock. No stock scope: any match. (Same as the
    // listing's row filter / `anyInStock` check.)
    const eligibleOf = (variants) =>
      !applyStockScope
        ? variants
        : inStock
          ? variants.filter(isVariantInStock)
          : variants.some(isVariantInStock)
            ? []
            : variants;

    for (const product of products) {
      const productFilterAttributes =
        product.filterAttributes && typeof product.filterAttributes === "object"
          ? product.filterAttributes
          : {};

      // Configurable products are judged per variant, as in the listing: the
      // product only counts if a variant matching the selected size/color
      // (and the price range) is in the stock scope.
      const isConfigurable =
        String(product.product_type || "").toUpperCase() === "CONFIGURABLE" &&
        Array.isArray(product.variants) &&
        product.variants.length > 0;
      const variantsMatching = (exceptKey) =>
        product.variants.filter((variant) =>
          variantMatchesFilters(variant, selectedVariantFilters, exceptKey)
        );

      // Price slider bounds: everything ALL the other filters allow, but NOT
      // the chosen price range itself — otherwise the slider shrinks to the
      // selection and the shopper can't widen it again.
      if (productMatchesExcept(productFilterAttributes, null)) {
        const pricedItems = isConfigurable
          ? eligibleOf(variantsMatching(null))
          : product.variants?.length
            ? product.variants
            : [product];
        pricedItems.forEach((item) => {
          const price = effectivePriceOf(item);
          if (price > 0) prices.push(price);
        });
      }

      // The values this product adds to one group: what the listing would show
      // with every selection applied except the group's own (the price range
      // always applies, as it narrows the listing).
      const valuesForKey = (key) => {
        if (!productMatchesExcept(productFilterAttributes, key)) return [];
        // Only the shopper's own pick is left out; search words still apply.
        const exceptKey = userSelectedKeys.has(key) ? key : null;

        if (!isConfigurable) {
          if (!priceInRange(product)) return [];
          return Array.isArray(productFilterAttributes[key])
            ? productFilterAttributes[key]
            : [];
        }

        const candidates = variantsMatching(exceptKey).filter(priceInRange);

        // A key the variants carry (size, color, ...): a value counts when
        // picking it would list the product — i.e. its matching variants are
        // in the stock scope (in stock: one has stock; out of stock: none
        // does). So a sold-out size isn't counted under "In Stock".
        if (product.variants.some((variant) => getVariantValue(variant, key) !== undefined)) {
          const byValue = new Map();
          candidates.forEach((variant) => {
            const raw = getVariantValue(variant, key);
            const normalized = raw === undefined ? "" : normalizeFilterTokenByKey(key, raw);
            if (!normalized) return;
            if (!byValue.has(normalized)) byValue.set(normalized, []);
            byValue.get(normalized).push(variant);
          });
          return [...byValue]
            .filter(([, group]) => eligibleOf(group).length > 0)
            .map(([value]) => value);
        }

        // Product-level key (material, season, ...): the product's own values,
        // if it's listed under the other selections.
        if (eligibleOf(candidates).length === 0) return [];
        return Array.isArray(productFilterAttributes[key])
          ? productFilterAttributes[key]
          : [];
      };

      FILTER_ATTRIBUTE_KEYS.forEach((key) => {
        const values = valuesForKey(key);
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
    // A category page asks with the category in the path (/filter/:slug);
    // the all-products/search listing asks /filter/all, where a ?category=
    // is the shopper's own facet pick — the group must stay so they can add
    // or remove categories.
    const isCategoryPage = Boolean(slug && slug !== "all");
    if (relevantParents.length > 0 && !isCategoryPage) {
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
