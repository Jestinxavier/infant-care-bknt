const productRepository = require("./product.repository");
const ApiError = require("../../core/ApiError");
const { validatePricing } = require("./rules/pricing.rules");
const { validateStockQuantity } = require("./rules/inventory.rules");
const {
  generateUniqueUrlKey,
  generateVariantUrlKey,
} = require("../../utils/slugGenerator");
const {
  suggestProductSku,
  generateVariantSku,
  generateUniqueSku,
  validateSku,
} = require("../../utils/skuGenerator");
const {
  validateCollectionsAndBadge,
  parseCollectionsInput,
} = require("../../utils/collectionUtils");
const {
  buildFilterAttributesQuery,
  normalizeFilterArray,
  sanitizeIncomingFilterAttributes,
  getFilterAttributeCardinalityViolations,
} = require("../../utils/filterAttributes");
const { buildVariantFilterMatchStage } = require("../../utils/variantFilterMatch");
const mongoose = require("mongoose");
const Product = require("./product.model");
const Review = require("../../models/Review");
const { getBundleAvailability } = require("./bundle.service");
const logger = require("../../utils/logger");
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

const attachReviewStats = async (items = []) => {
  const productIds = items
    .map((item) => item.parentId || item._id || item.id)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (!productIds.length) return items;

  const stats = await Review.aggregate([
    {
      $match: {
        productId: { $in: productIds },
        isApproved: true,
      },
    },
    {
      $group: {
        _id: "$productId",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);
  const statsByProduct = new Map(
    stats.map((stat) => [String(stat._id), stat]),
  );

  return items.map((item) => {
    const productId = String(item.parentId || item._id || item.id || "");
    const stat = statsByProduct.get(productId);
    return {
      ...item,
      averageRating: stat ? Number(stat.averageRating.toFixed(2)) : 0,
      totalReviews: stat?.totalReviews || 0,
    };
  });
};
const SEARCH_TEXT_FIELDS = [
  "title",
  "name",
  "description",
  "categoryName",
  "filterAttributes.gender",
  "filterAttributes.material",
  "filterAttributes.occasion",
  "filterAttributes.pattern",
  "collections",
  "variants.name",
];


const buildSearchQuery = (searchTerm, { includeFuzzy = false } = {}) => {
  const tokens = tokenizeSearchTerm(searchTerm);
  if (tokens.length === 0) return null;

  const tokenClauses = tokens
    .map((token) => {
      const tokenRegex = buildTokenRegex(token, { includeFuzzy });
      if (!tokenRegex) return null;

      const clauses = [
        ...SEARCH_TEXT_FIELDS.map((field) => ({ [field]: tokenRegex })),
        ...buildExtraTokenClauses(token),
      ];
      // SKU leg: plain prefix on root + variant SKUs. Never typo-expanded —
      // a one-char edit of a SKU is a different product's SKU.
      if (/[0-9-]/.test(token)) clauses.push(...buildSkuPrefixClauses(token));
      return { $or: clauses };
    })
    .filter(Boolean);

  if (tokenClauses.length === 0) return null;
  if (tokenClauses.length === 1) return tokenClauses[0];

  return { $and: tokenClauses };
};

/**
 * Relevance rank for a search listing with no sort chosen. The search also
 * matches descriptions, so a product that merely mentions the word (e.g. sleep
 * suits whose promo text says "free knot Jabalas") used to outrank the actual
 * products, because the default sort is newest first. Rank:
 *   0 - the title matches every search word and the category matches too
 *   1 - the title matches every search word
 *   2 - the title or category matches at least one word
 *   3 - matched elsewhere only (description, attributes, collections, ...)
 * Rank 0 puts products from the matching category first: "diaper" lists the
 * "Diapering & Nappies" products before "Jhabla & Nappy" sets (Sets & Combos),
 * and "frock" lists "Dresses & Frocks" first.
 * The requested/default sort still orders products within each rank.
 */
const buildSearchRankStage = (searchTerm, { includeFuzzy = false } = {}) => {
  const regexes = tokenizeSearchTerm(searchTerm)
    .map((token) => buildTokenRegex(token, { includeFuzzy }))
    .filter(Boolean);
  if (regexes.length === 0) return null;

  const matches = (field, { $regex, $options }) => ({
    $regexMatch: {
      input: { $ifNull: [{ $toString: `$${field}` }, ""] },
      regex: $regex,
      options: $options,
    },
  });

  return {
    $addFields: {
      _searchRank: {
        $switch: {
          branches: [
            {
              case: {
                $and: [
                  ...regexes.map((r) => matches("title", r)),
                  { $or: regexes.map((r) => matches("categoryName", r)) },
                ],
              },
              then: 0,
            },
            { case: { $and: regexes.map((r) => matches("title", r)) }, then: 1 },
            {
              case: {
                $or: regexes.flatMap((r) => [
                  matches("title", r),
                  matches("categoryName", r),
                ]),
              },
              then: 2,
            },
          ],
          default: 3,
        },
      },
    },
  };
};

/**
 * Product Service
 * Contains all business logic for products
 * Reusable by both storefront and admin controllers
 */
class ProductService {
  /**
   * Get all products (with filtering and pagination)
   */
  /**
   * Get all products with advanced filtering and grouping (PLP)
   */
  async getAllProducts(filters = {}, options = {}) {
    // Current time for offer validation
    const now = new Date();
    const effectiveFilters = applySearchIntentFilters(filters);
    const {
      page = 1,
      limit = 20,
      category,
      status = "published",
      minPrice,
      maxPrice,
      inStock: inStockParam,
    } = effectiveFilters;

    // Normalize inStock so filter is applied correctly (query params are strings)
    const inStock =
      inStockParam === true || inStockParam === "true"
        ? true
        : inStockParam === false || inStockParam === "false"
        ? false
        : undefined;

    let { sortBy = "createdAt", sortOrder = "desc" } = effectiveFilters;

    // Handle combined "sort" parameter (e.g. price_low, price_high, newest)
    // Check raw filters to avoid default "createdAt" unless explicitly checking
    const sortParam = effectiveFilters.sort || effectiveFilters.sortBy;

    if (sortParam) {
      const parts = sortParam.split("_");
      if (parts.length >= 2) {
        sortBy = parts[0];
        // "low" usually means ASC (Cheapest first), "high" means DESC (Expensive first)
        if (parts[1] === "low" || parts[1] === "asc") sortOrder = "asc";
        else if (parts[1] === "high" || parts[1] === "desc") sortOrder = "desc";
      } else if (sortParam === "newest") {
        sortBy = "createdAt";
        sortOrder = "desc";
      } else if (sortParam === "oldest") {
        sortBy = "createdAt";
        sortOrder = "asc";
      } else {
        sortBy = sortParam;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitVal = parseInt(limit);

    // Map sort keys
    const sortMap = {
      price: "price",
      createdAt: "createdAt",
      rating: "averageRating",
      title: "title",
      name: "title",
    };
    const mappedSortKey = sortMap[sortBy] || sortBy;

    // 1. Initial Match Stage - Filter Parent Products
    const matchStage = {};

    if (!options.isAdmin) {
      matchStage.status = "published";
    } else if (status) {
      matchStage.status = status;
    }

    if (category) {
      if (Array.isArray(category)) {
        const categoryObjectIds = category.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        // Match products where the resolved category IDs appear in either
        // the primary `category` field OR in the `subCategories` array.
        // This ensures products assigned as parent=Rompers + subCategory=HalfRomper
        // are returned when browsing /category/rompers/half-romper.
        if (!matchStage.$or) matchStage.$or = [];
        matchStage.$or.push(
          { category: { $in: categoryObjectIds } },
          { subCategories: { $in: categoryObjectIds } }
        );
      } else if (mongoose.Types.ObjectId.isValid(category)) {
        const categoryObjectId = new mongoose.Types.ObjectId(category);
        if (!matchStage.$or) matchStage.$or = [];
        matchStage.$or.push(
          { category: categoryObjectId },
          { subCategories: categoryObjectId }
        );
      }
    }

    if (effectiveFilters.subCategories) {
      const subCatIds = Array.isArray(effectiveFilters.subCategories)
        ? effectiveFilters.subCategories
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id))
        : mongoose.Types.ObjectId.isValid(effectiveFilters.subCategories)
        ? [new mongoose.Types.ObjectId(effectiveFilters.subCategories)]
        : [];

      if (subCatIds.length > 0) {
        matchStage.subCategories = { $in: subCatIds };
      }
    }

    if (effectiveFilters.collection) {
      const collectionSlugs = Array.isArray(effectiveFilters.collection)
        ? effectiveFilters.collection
        : [effectiveFilters.collection];
      matchStage.collections = { $in: collectionSlugs.filter(Boolean) };
    }

    Object.assign(matchStage, buildFilterAttributesQuery(effectiveFilters));

    // Exact SKU query → show exactly that product (same rule as the search
    // suggest endpoint), even when it is out of stock, unless the shopper
    // explicitly chose a stock filter.
    const exactSkuIds = options.isAdmin
      ? []
      : await findExactSkuProductIds(filters.search);
    const isExactSkuSearch = exactSkuIds.length > 0;

    // Search. Storefront: Meilisearch picks and orders the matching products,
    // and every filter below still applies in MongoDB. Admin, or when
    // Meilisearch is unavailable or finds nothing: the regex search, added
    // under $and so it never overwrites the category/subcategory $or above.
    let searchRankStage = null;
    const rawSearchTerm = String(effectiveFilters.search || "").trim();
    const searchIds =
      !isExactSkuSearch && rawSearchTerm && !options.isAdmin
        ? await findSearchProductIds(rawSearchTerm)
        : null;

    if (isExactSkuSearch) {
      matchStage._id = { $in: exactSkuIds };
    } else if (searchIds) {
      const searchObjectIds = searchIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      matchStage._id = { $in: searchObjectIds };
      if (!effectiveFilters.sortExplicit) {
        searchRankStage = {
          $addFields: { _searchRank: { $indexOfArray: [searchObjectIds, "$_id"] } },
        };
      }
    } else if (effectiveFilters.search) {
      if (rawSearchTerm) {
        const searchQuery = buildSearchQuery(rawSearchTerm, {
          includeFuzzy: !!effectiveFilters.searchFuzzy,
        });
        if (searchQuery) {
          matchStage.$and = [...(matchStage.$and || []), searchQuery];
        }
        if (!effectiveFilters.sortExplicit) {
          searchRankStage = buildSearchRankStage(rawSearchTerm, {
            includeFuzzy: !!effectiveFilters.searchFuzzy,
          });
        }
      }
    }

    // Out-of-stock only is applied after grouping (see `anyInStock` below): a
    // product qualifies when none of its matching rows is in stock. It used to
    // test the product-level stockObj, which defaults to isInStock: true and is
    // never updated for CONFIGURABLE products — so it hid every one of them,
    // fully sold-out ones included.
    const stockFilterApplies = !(isExactSkuSearch && !effectiveFilters.inStockExplicit);

    // Storefront: a size/color filter must match the variant itself, so the
    // stock check below runs on the chosen size — not on any size of the
    // product (filterAttributes alone lists a product whose chosen size is
    // sold out). Admin keeps product-level matching.
    const variantFilterStage = options.isAdmin
      ? null
      : await buildVariantFilterMatchStage(effectiveFilters);

    // 2. Aggregation Pipeline
    const pipeline = [
      { $match: matchStage },
      // Unwind variants but keep simple products (no variants)
      {
        $unwind: {
          path: "$variants",
          preserveNullAndEmptyArrays: true,
        },
      },
      ...(variantFilterStage ? [variantFilterStage] : []),

      // Lookup category by categoryCode (more efficient than ObjectId lookup)
      {
        $lookup: {
          from: "categories",
          localField: "categoryCode",
          foreignField: "code",
          as: "categoryInfo",
        },
      },
      {
        $addFields: {
          categoryName: {
            $ifNull: [
              { $arrayElemAt: ["$categoryInfo.name", 0] },
              "$categoryName", // Fallback to existing categoryName field
            ],
          },
        },
      },

      // Calculate effective price and stock (Handle both Variant and Simple Product)
      {
        $addFields: {
          effectivePrice: {
            $cond: {
              if: { $eq: ["$product_type", "CONFIGURABLE"] },
              then: {
                $let: {
                  vars: {
                    vPrice: { $ifNull: ["$variants.price", 0] },
                    vOffer: { $ifNull: ["$variants.offerPrice", 0] },
                    vStart: { $ifNull: ["$variants.offerStartAt", null] },
                    vEnd: { $ifNull: ["$variants.offerEndAt", null] },
                  },
                  in: {
                    $cond: {
                      if: {
                        $and: [
                          { $gt: ["$$vOffer", 0] },
                          {
                            $or: [
                              { $eq: ["$$vStart", null] },
                              { $lte: ["$$vStart", now] },
                            ],
                          },
                          {
                            $or: [
                              { $eq: ["$$vEnd", null] },
                              { $gte: ["$$vEnd", now] },
                            ],
                          },
                        ],
                      },
                      then: "$$vOffer",
                      else: "$$vPrice",
                    },
                  },
                },
              },
              else: {
                $let: {
                  vars: {
                    pPrice: { $ifNull: ["$price", 0] },
                    pOffer: { $ifNull: ["$offerPrice", 0] },
                    pStart: { $ifNull: ["$offerStartAt", null] },
                    pEnd: { $ifNull: ["$offerEndAt", null] },
                  },
                  in: {
                    $cond: {
                      if: {
                        $and: [
                          { $gt: ["$$pOffer", 0] },
                          {
                            $or: [
                              { $eq: ["$$pStart", null] },
                              { $lte: ["$$pStart", now] },
                            ],
                          },
                          {
                            $or: [
                              { $eq: ["$$pEnd", null] },
                              { $gte: ["$$pEnd", now] },
                            ],
                          },
                        ],
                      },
                      then: "$$pOffer",
                      else: "$$pPrice",
                    },
                  },
                },
              },
            },
          },
          isInStock: {
            $cond: {
              if: { $eq: ["$product_type", "CONFIGURABLE"] },
              then: {
                // Configurable product variant check
                $cond: {
                  if: {
                    $cond: {
                      if: { $ifNull: ["$variants.stockObj", false] },
                      then: {
                        $cond: {
                          if: { $ne: [{ $type: "$variants.stockObj.available" }, "missing"] },
                          then: { $gt: ["$variants.stockObj.available", 0] },
                          else: { $eq: ["$variants.stockObj.isInStock", true] }
                        }
                      },
                      else: { $gt: ["$variants.stock", 0] }
                    }
                  },
                  then: true,
                  else: false
                }
              },
              else: {
                // Simple product check
                $cond: {
                  if: {
                    $cond: {
                      if: { $ifNull: ["$stockObj", false] },
                      then: {
                        $cond: {
                          if: { $ne: [{ $type: "$stockObj.available" }, "missing"] },
                          then: { $gt: ["$stockObj.available", 0] },
                          else: { $eq: ["$stockObj.isInStock", true] }
                        }
                      },
                      else: { $gt: ["$stock", 0] }
                    }
                  },
                  then: true,
                  else: false
                }
              }
            }
          },
        },
      },

      // Filter Logic (Price & Stock)
      ...(minPrice || maxPrice
        ? [
            {
              $match: {
                effectivePrice: {
                  ...(minPrice ? { $gte: parseFloat(minPrice) } : {}),
                  ...(maxPrice ? { $lte: parseFloat(maxPrice) } : {}),
                },
              },
            },
          ]
        : []),

      // Stock Filter (inStock is normalized above). In stock: keep only
      // in-stock rows, so the product needs a matching variant with stock.
      // Out of stock is decided per product after the $group.
      ...(stockFilterApplies && inStock === true
        ? [{ $match: { isInStock: true } }]
        : []),

      // Grouping Stage — product-centric: ONE row per product, regardless of type.
      // SIMPLE       → 1 row (its single underlying sellable item).
      // CONFIGURABLE → 1 row aggregating min/max price, total stock & variant count.
      // BUNDLE       → 1 row with product-level price + component count.
      {
        $group: {
          _id: "$_id", // Parent product id
          parentId: { $first: "$_id" },
          title: { $first: "$title" },
          product_type: { $first: "$product_type" },
          url_key: {
            $first: { $ifNull: ["$url_key", "$variants.url_key", ""] },
          },
          slug: {
            $first: { $ifNull: ["$url_key", "$variants.url_key", ""] },
          },
          sku: { $first: "$sku" },
          category: { $first: "$category" },
          categoryName: { $first: "$categoryName" },
          collections: { $first: { $ifNull: ["$collections", []] } },
          badgeCollection: { $first: { $ifNull: ["$badgeCollection", null] } },

          // Always null here — the listing is product-centric, cards link to the
          // parent product page (variant selection happens on the PDP).
          variantId: { $first: null },
          variantSku: { $first: null },

          image: {
            $first: {
              $ifNull: [
                { $arrayElemAt: ["$images", 0] },
                { $arrayElemAt: ["$variants.images", 0] },
                "",
              ],
            },
          },

          // Pricing — min current/effective price ("From ₹X"), min & max regular price
          price: {
            $min: {
              $cond: [
                { $eq: ["$product_type", "BUNDLE"] },
                "$effectivePrice",
                "$effectivePrice",
              ],
            },
          },
          maxPrice: {
            $max: "$effectivePrice",
          },
          regularPrice: {
            $min: {
              $cond: [
                { $eq: ["$product_type", "BUNDLE"] },
                { $ifNull: ["$price", 0] },
                { $ifNull: ["$variants.price", "$price", 0] },
              ],
            },
          },
          maxRegularPrice: {
            $max: {
              $cond: [
                { $eq: ["$product_type", "BUNDLE"] },
                { $ifNull: ["$price", 0] },
                { $ifNull: ["$variants.price", "$price", 0] },
              ],
            },
          },

          // Stock — aggregate across variants; simple/bundle use product-level stock.
          // Each grouped doc is one variant (or the parent for simple/bundle).
          totalStock: {
            $sum: {
              $cond: {
                if: { $eq: ["$product_type", "CONFIGURABLE"] },
                then: {
                  $ifNull: [
                    "$variants.stockObj.available",
                    { $ifNull: ["$variants.stock", 0] },
                    0,
                  ],
                },
                else: {
                  $ifNull: [
                    "$stockObj.available",
                    { $ifNull: ["$stock", 0] },
                    0,
                  ],
                },
              },
            },
          },

          // Variant count — 0 for simple/bundle (nothing to expand), N for configurable
          variantCount: {
            $sum: {
              $cond: [
                { $eq: ["$product_type", "CONFIGURABLE"] },
                1,
                0,
              ],
            },
          },

          // Bundle/choice component count (product-level, not flattened into rows)
          bundleItemCount: {
            $first: {
              $cond: {
                if: { $eq: ["$product_type", "BUNDLE"] },
                then: { $size: { $ifNull: ["$bundle_config.items", []] } },
                else: null,
              },
            },
          },

          // Sorting fields
          createdAt: { $first: "$createdAt" },
          averageRating: { $first: "$averageRating" },

          // Metadata
          colors: { $addToSet: "$variants.attributes.color" },
          variantSizes: { $addToSet: "$variants.attributes.size" },

          // True when any matching row (variant, or the product itself) is in stock.
          anyInStock: { $max: "$isInStock" },

          // With a size/color filter, the rows left are the variants that
          // match it (in stock, unless Out of Stock was chosen): link the card
          // to the first one so the PDP opens the chosen size, not its default.
          ...(variantFilterStage
            ? { matchedVariantUrlKey: { $first: "$variants.url_key" } }
            : {}),
        },
      },

      // Out of stock only: no matching variant has stock.
      ...(stockFilterApplies && inStock === false
        ? [{ $match: { anyInStock: false } }]
        : []),

      // Ensure unique ID for frontend (parent product ID) and derive discount/stock aliases
      {
        $addFields: {
          id: "$parentId",
          // Active offer (effective < regular) → show discounted "From ₹X"
          discountPrice: {
            $cond: [
              { $lt: ["$price", "$regularPrice"] },
              "$price",
              null,
            ],
          },
          stock: "$totalStock",
          hasVariants: { $gt: ["$variantCount", 0] },
        },
      },
      {
        $lookup: {
          from: "collections",
          localField: "badgeCollection",
          foreignField: "slug",
          as: "badgeCollectionMeta",
        },
      },
      {
        $addFields: {
          badgeCollectionMeta: {
            $cond: {
              if: { $gt: [{ $size: "$badgeCollectionMeta" }, 0] },
              then: { $arrayElemAt: ["$badgeCollectionMeta", 0] },
              else: null,
            },
          }
        },
      },
      {
        $addFields: {
          badge: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$badgeCollection", null] },
                  { $ne: ["$badgeCollectionMeta", null] },
                ],
              },
              then: {
                slug: "$badgeCollection",
                label: {
                  $ifNull: [
                    "$badgeCollectionMeta.badgeLabel",
                    { $ifNull: ["$badgeCollectionMeta.name", "$badgeCollection"] },
                  ],
                },
                color: { $ifNull: ["$badgeCollectionMeta.badgeColor", null] },
                labelColor: {
                  $ifNull: ["$badgeCollectionMeta.badgeLabelColor", null],
                },
              },
              else: null,
            },
          },
        },
      },

      // Remove internal MongoDB IDs and unnecessary fields
      {
        $project: {
          "badgeCollectionMeta.__v": 0,
          "badgeCollectionMeta.createdAt": 0,
          "badgeCollectionMeta.updatedAt": 0,
        },
      },

      // Sorting: a search with no sort chosen ranks by relevance first (see
      // buildSearchRankStage); otherwise the requested sort as before.
      ...(searchRankStage
        ? [
            searchRankStage,
            { $sort: { _searchRank: 1, [mappedSortKey]: sortOrder === "asc" ? 1 : -1 } },
            { $unset: "_searchRank" },
          ]
        : [{ $sort: { [mappedSortKey]: sortOrder === "asc" ? 1 : -1 } }]),

      // Pagination with Facet
      {
        $facet: {
          metadata: [{ $count: "total" }],
          items: [{ $skip: skip }, { $limit: limitVal }],
        },
      },
    ];

    const result = await productRepository.aggregate(pipeline);

    const data = result[0];
    const total = data.metadata.length > 0 ? data.metadata[0].total : 0;
    const totalPages = Math.ceil(total / limitVal);

    // Bundles are sold as complete sets. Never use the manually entered parent
    // stock for PLP availability; derive it from the current child inventory.
    const bundleItems = data.items.filter(
      (item) => item.product_type === "BUNDLE",
    );
    if (bundleItems.length > 0) {
      const bundleIds = bundleItems.map((item) => item.parentId || item._id);
      const bundleProducts = await Product.find({ _id: { $in: bundleIds } })
        .select("bundle_config")
        .lean();
      const bundleById = new Map(
        bundleProducts.map((product) => [String(product._id), product]),
      );
      const childSkus = [
        ...new Set(
          bundleProducts.flatMap((product) =>
            (product.bundle_config?.items || []).map((item) => item.sku),
          ),
        ),
      ];
      const children = await Product.find({
        status: "published",
        $or: [
          { product_type: "SIMPLE", sku: { $in: childSkus } },
          { product_type: "CONFIGURABLE", "variants.sku": { $in: childSkus } },
        ],
      })
        .select("sku stock stockObj variants")
        .lean();
      const childStock = new Map();
      for (const child of children) {
        if (child.product_type === "SIMPLE") {
          childStock.set(
            child.sku,
            Number(child.stockObj?.available ?? child.stock ?? 0),
          );
        }
        for (const variant of child.variants || []) {
          childStock.set(
            variant.sku,
            Number(variant.stockObj?.available ?? variant.stock ?? 0),
          );
        }
      }
      for (const item of bundleItems) {
        const product = bundleById.get(String(item.parentId || item._id));
        const components = product?.bundle_config?.items || [];
        let available = components.length
          ? Math.min(
              ...components.map((component) =>
                Math.floor(
                  (childStock.get(component.sku) ?? 0) / (component.qty || 1),
                ),
              ),
            )
          : 0;

        // Keep the list endpoint consistent with the PDP stock resolver. This
        // fallback handles legacy variant records that are not returned by the
        // aggregate child lookup, while retaining the batch lookup above for
        // the normal case.
        if (available === 0 && components.length > 0) {
          const resolved = await getBundleAvailability(product.bundle_config, {
            requirePublished: true,
          });
          available = resolved.availableQty;
        }
        item.stock = available;
        item.totalStock = available;
        item.bundleItemCount = components.length;
        item.isInStock = available > 0;
      }
    }

    data.items = await attachReviewStats(data.items);

    return {
      success: true,
      items: data.items,
      pagination: {
        page: parseInt(page),
        limit: limitVal,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get product by ID
   */
  async getProductById(productId, options = {}) {
    const product = await productRepository.findById(productId, {
      populate: [{ path: "category", select: "name slug" }],
    });

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    // Check if product is published (for storefront)
    if (!options.isAdmin && product.status !== "published") {
      throw ApiError.notFound("Product not found");
    }

    return product;
  }

  /**
   * Get product by URL key
   */
  async getProductByUrlKey(urlKey, options = {}) {
    const product = await productRepository.findByUrlKey(urlKey, {
      populate: [{ path: "category", select: "name slug" }],
    });

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    if (!options.isAdmin && product.status !== "published") {
      throw ApiError.notFound("Product not found");
    }

    return product;
  }

  /**
   * Create product
   */
  async createProduct(inputData) {
    logger.info("=== createProduct called ===");
    logger.info("Input SKU:", inputData.sku);

    // Clone input
    const productData = { ...inputData };
    if (typeof productData.filterAttributes === "string") {
      try {
        productData.filterAttributes = JSON.parse(productData.filterAttributes);
      } catch (_error) {
        productData.filterAttributes = {};
      }
    }

    if (
      productData.filterAttributes &&
      typeof productData.filterAttributes === "object"
    ) {
      const cardinalityViolations = getFilterAttributeCardinalityViolations(
        productData.filterAttributes,
        {
          productType: productData.product_type || "SIMPLE",
        }
      );

      if (cardinalityViolations.length > 0) {
        throw ApiError.validation(
          "Invalid filterAttributes: some fields accept only a single value.",
          cardinalityViolations.map((item) => ({
            key: item.key,
            values: item.values,
          }))
        );
      }

      productData.filterAttributes = sanitizeIncomingFilterAttributes(
        productData.filterAttributes
      );
    }

    const parsedCollections = await validateCollectionsAndBadge({
      collections:
        productData.collections !== undefined
          ? productData.collections
          : parseCollectionsInput(productData.tags),
      badgeCollection: productData.badgeCollection,
    });
    productData.collections = parsedCollections.collections;
    productData.badgeCollection = parsedCollections.badgeCollection;

    // Generate URL key if not provided
    if (!productData.url_key && productData.title) {
      const checkUrlKeyExists = async (urlKey) => {
        const existing = await productRepository.findByUrlKey(urlKey);
        return !!existing;
      };
      productData.url_key = await generateUniqueUrlKey(
        productData.title,
        checkUrlKeyExists
      );
    }

    if (!productData.categoryCode && productData.category) {
      const Category = mongoose.model("Category");
      const category = await Category.findById(productData.category);
      if (category) {
        productData.categoryCode = category.code;
        productData.categoryName = category.name;
      }
    }

    // Auto-generate SKU
    if (
      !productData.sku ||
      (typeof productData.sku === "string" && !productData.sku.trim())
    ) {
      logger.info(">>> Auto-generating SKU...");
      // Check SKU uniqueness helper
      const checkSkuExists = async (sku) => {
        const Product = require("./product.model");
        const existing = await Product.findOne({
          $or: [{ sku: sku }, { "variants.sku": sku }],
        });
        return !!existing;
      };

      productData.sku = await generateUniqueSku(null, checkSkuExists, null, {
        strategy: "structured",
        categoryCode: productData.categoryCode,
        productName: productData.title,
      });
      logger.info(">>> Generated SKU:", productData.sku);
    } else {
      const skuValidation = validateSku(productData.sku);
      if (!skuValidation.valid) {
        throw ApiError.validation(`Invalid SKU: ${skuValidation.error}`);
      }

      const checkSkuExists = async (sku) => {
        const Product = require("./product.model");
        const existing = await Product.findOne({
          $or: [{ sku: sku }, { "variants.sku": sku }],
        });
        return !!existing;
      };

      const skuExists = await checkSkuExists(productData.sku);
      if (skuExists) {
        throw ApiError.validation("SKU already exists");
      }
    }

    if (!productData.sku) {
      logger.error("!!! SKU is null after generation !!!");
      throw ApiError.internal("Failed to generate product SKU");
    }

    const productId = new mongoose.Types.ObjectId();
    productData._id = productId;

    // Validate variants if provided
    if (productData.variants && Array.isArray(productData.variants)) {
      const allVariantSkus = [];

      for (const variant of productData.variants) {
        // Enforce Variant ID Format: ParentID-ConfigurationCode
        let configCode = "";

        if (variant.attributes && typeof variant.attributes === "object") {
          const parts = [];
          if (variant.attributes.color)
            parts.push(variant.attributes.color.substring(0, 3).toUpperCase());
          if (variant.attributes.size)
            parts.push(variant.attributes.size.toUpperCase());
          if (parts.length > 0) configCode = parts.join("-");
        }

        if (!configCode) {
          configCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        }

        // Set the structured ID
        variant.id = `${productId}-${configCode}`;

        // Link to parent
        variant.parentId = productId;

        // Auto-generate Variant SKU if missing
        if (!variant.sku) {
          variant.sku = generateVariantSku(
            productData.sku,
            variant.attributes || variant.options || {}
          );
        }

        // Auto-generate Variant URL Key if missing
        if (!variant.url_key) {
          variant.url_key = generateVariantUrlKey(
            productData.url_key,
            variant.attributes || variant.options || {},
            { fallbackSuffix: configCode.toLowerCase() },
          );
        }

        // Validate pricing
        const price = variant.pricing?.price || variant.price;
        const discountPrice =
          variant.pricing?.discountPrice || variant.discountPrice;

        if (price !== undefined) {
          const validation = validatePricing(price, discountPrice || price);
          if (!validation.valid) {
            throw ApiError.validation(validation.error);
          }
        }

        // Validate stock
        const stock = variant.stockObj?.available || variant.stock;
        if (stock !== undefined) {
          const stockValidation = validateStockQuantity(stock);
          if (!stockValidation.valid) {
            throw ApiError.validation(stockValidation.error);
          }
        }

        // Validate variant SKU
        if (variant.sku) {
          const skuValidation = validateSku(variant.sku);
          if (!skuValidation.valid) {
            throw ApiError.validation(
              `Invalid variant SKU: ${skuValidation.error}`
            );
          }

          // Check for duplicate SKUs within this product
          if (allVariantSkus.includes(variant.sku)) {
            throw ApiError.validation(`Duplicate variant SKU: ${variant.sku}`);
          }
          allVariantSkus.push(variant.sku);

          // Check global SKU uniqueness
          const checkSkuExists = async (sku) => {
            const Product = require("./product.model");
            const existing = await Product.findOne({
              $or: [{ sku: sku }, { "variants.sku": sku }],
            });
            return !!existing;
          };

          const skuExists = await checkSkuExists(variant.sku);
          if (skuExists) {
            throw ApiError.validation(
              `Variant SKU already exists: ${variant.sku}`
            );
          }
        }
      }
    }

    const product = await productRepository.create(productData);
    return product;
  }

  /**
   * Update product
   */
  async updateProduct(productId, inputData) {
    const updateData = { ...inputData };
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    if (typeof updateData.filterAttributes === "string") {
      try {
        updateData.filterAttributes = JSON.parse(updateData.filterAttributes);
      } catch (_error) {
        updateData.filterAttributes = {};
      }
    }

    if (
      updateData.filterAttributes &&
      typeof updateData.filterAttributes === "object"
    ) {
      const cardinalityViolations = getFilterAttributeCardinalityViolations(
        updateData.filterAttributes,
        {
          productType: updateData.product_type || product.product_type,
        }
      );

      if (cardinalityViolations.length > 0) {
        throw ApiError.validation(
          "Invalid filterAttributes: some fields accept only a single value.",
          cardinalityViolations.map((item) => ({
            key: item.key,
            values: item.values,
          }))
        );
      }

      updateData.filterAttributes = sanitizeIncomingFilterAttributes(
        updateData.filterAttributes
      );
    }

    if (
      updateData.collections !== undefined ||
      updateData.badgeCollection !== undefined ||
      updateData.tags !== undefined
    ) {
      const incomingCollections =
        updateData.collections !== undefined
          ? updateData.collections
          : updateData.tags !== undefined
          ? parseCollectionsInput(updateData.tags)
          : product.collections || [];
      const normalizedIncomingCollections = parseCollectionsInput(
        incomingCollections
      );
      const parsedCollections = await validateCollectionsAndBadge({
        collections: incomingCollections,
        badgeCollection:
          updateData.badgeCollection !== undefined
            ? updateData.badgeCollection
            : updateData.collections !== undefined &&
              product.badgeCollection &&
              !normalizedIncomingCollections.includes(product.badgeCollection)
            ? null
            : product.badgeCollection || null,
      });
      updateData.collections = parsedCollections.collections;
      updateData.badgeCollection = parsedCollections.badgeCollection;
    }

    // Auto-generate SKU if missing in DB or if explicit empty string provided
    const isSkuEmptyUpdate =
      updateData.sku !== undefined &&
      (!updateData.sku ||
        (typeof updateData.sku === "string" && !updateData.sku.trim()));
    const isSkuMissingInDb = !product.sku;

    if (
      isSkuEmptyUpdate ||
      (updateData.sku === undefined && isSkuMissingInDb)
    ) {
      // Resolve Category Code
      let categoryCode = product.categoryCode; // Try to use existing
      let categoryId = updateData.category || product.category;

      // If we don't have code but have ID, fetch it (unless it's null)
      if (!categoryCode && categoryId) {
        const Category = mongoose.model("Category");
        const category = await Category.findById(categoryId);
        if (category) categoryCode = category.code;
      }

      const checkSkuExists = async (sku, excludeId) => {
        const Product = require("./product.model");
        const query = {
          $or: [{ sku: sku }, { "variants.sku": sku }],
        };
        if (excludeId) {
          query._id = { $ne: excludeId };
        }
        const existing = await Product.findOne(query);
        return !!existing;
      };

      updateData.sku = await generateUniqueSku(
        product.sku, // Pass null/empty as base
        async (s) => checkSkuExists(s, productId),
        productId,
        {
          strategy: "structured",
          categoryCode: categoryCode,
          productName: updateData.title || product.title,
        }
      );
    }

    // Check SKU locking if updating product SKU
    if (updateData.sku !== undefined && updateData.sku !== product.sku) {
      if (product.skuLocked) {
        throw ApiError.forbidden(
          "Cannot change SKU: Product SKU is locked (used in orders)"
        );
      }

      if (updateData.sku) {
        const skuValidation = validateSku(updateData.sku);
        if (!skuValidation.valid) {
          throw ApiError.validation(`Invalid SKU: ${skuValidation.error}`);
        }

        // Check SKU uniqueness (exclude current product)
        const checkSkuExists = async (sku, excludeId) => {
          const Product = require("./product.model");
          const query = {
            $or: [{ sku: sku }, { "variants.sku": sku }],
          };
          if (excludeId) {
            query._id = { $ne: excludeId };
          }
          const existing = await Product.findOne(query);
          return !!existing;
        };

        const skuExists = await checkSkuExists(updateData.sku, productId);
        if (skuExists) {
          throw ApiError.validation("SKU already exists");
        }
      }
    }

    // Handle URL key updates with redirect creation
    if (
      updateData.url_key !== undefined &&
      updateData.url_key !== product.url_key
    ) {
      if (updateData.url_key) {
        const checkUrlKeyExists = async (urlKey, excludeId) => {
          const query = { url_key: urlKey };
          if (excludeId) {
            query._id = { $ne: excludeId };
          }
          const existing = await productRepository.findOne(query);
          return !!existing;
        };

        const urlKeyExists = await checkUrlKeyExists(
          updateData.url_key,
          productId
        );
        if (urlKeyExists) {
          throw ApiError.validation("URL key already exists");
        }

        // Add previous URL key to history if it's changing
        if (product.url_key && product.url_key !== updateData.url_key) {
          if (!updateData.urlKeyHistory) {
            updateData.urlKeyHistory = [...(product.urlKeyHistory || [])];
          }
          updateData.urlKeyHistory.push({
            urlKey: product.url_key,
            createdAt: new Date(),
          });
        }
      }
    }

    // Validate variants if being updated (auto-generate variant SKU/url_key when missing)
    if (updateData.variants && Array.isArray(updateData.variants)) {
      const allVariantSkus = [];
      const usedVariantSkus = new Set();
      const productSku =
        updateData.sku !== undefined ? updateData.sku : product.sku;
      const productUrlKey =
        updateData.url_key !== undefined ? updateData.url_key : product.url_key;
      const { generateSlug } = require("../../utils/slugGenerator");

      for (let i = 0; i < updateData.variants.length; i++) {
        const variant = updateData.variants[i];
        const existingVariant = product.variants.find(
          (v) => v.id === variant.id
        );

        // Auto-generate variant SKU when missing (align with createProduct / controllers)
        if (
          !variant.sku ||
          (typeof variant.sku === "string" && !variant.sku.trim())
        ) {
          const attrs = variant.attributes || variant.options || {};
          const attrsObj =
            attrs instanceof Map
              ? Object.fromEntries(attrs)
              : { ...(attrs || {}) };
          variant.sku = generateVariantSku(productSku, attrsObj);
          let uniqueSku = variant.sku;
          let suffix = 2;
          while (usedVariantSkus.has(uniqueSku)) {
            uniqueSku = `${variant.sku}-${suffix}`;
            suffix++;
          }
          usedVariantSkus.add(uniqueSku);
          variant.sku = uniqueSku;
        } else {
          usedVariantSkus.add(variant.sku);
        }

        // Auto-generate variant url_key when missing
        if (
          !variant.url_key ||
          (typeof variant.url_key === "string" && !variant.url_key.trim())
        ) {
          if (productUrlKey) {
            const attrs = variant.attributes || variant.options || {};
            const attrsObj =
              attrs instanceof Map
                ? Object.fromEntries(attrs)
                : { ...(attrs || {}) };
            const parts = [productUrlKey];
            if (attrsObj.color) parts.push(generateSlug(attrsObj.color));
            if (attrsObj.size || attrsObj.age)
              parts.push(generateSlug(attrsObj.size || attrsObj.age));
            variant.url_key = parts.join("-") + "-" + (variant.sku || i);
          }
        }

        // Check variant SKU locking
        if (
          variant.sku !== undefined &&
          existingVariant &&
          variant.sku !== existingVariant.sku
        ) {
          if (existingVariant.skuLocked) {
            throw ApiError.forbidden(
              `Cannot change variant SKU: SKU ${existingVariant.sku} is locked (used in orders)`
            );
          }
        }

        // Validate pricing
        const price = variant.pricing?.price || variant.price;
        const discountPrice =
          variant.pricing?.discountPrice || variant.discountPrice;

        if (price !== undefined) {
          const validation = validatePricing(price, discountPrice || price);
          if (!validation.valid) {
            throw ApiError.validation(validation.error);
          }
        }

        // Validate stock
        const stock = variant.stockObj?.available || variant.stock;
        if (stock !== undefined) {
          const stockValidation = validateStockQuantity(stock);
          if (!stockValidation.valid) {
            throw ApiError.validation(stockValidation.error);
          }
        }

        // Validate variant SKU
        if (variant.sku) {
          const skuValidation = validateSku(variant.sku);
          if (!skuValidation.valid) {
            throw ApiError.validation(
              `Invalid variant SKU: ${skuValidation.error}`
            );
          }

          // Check for duplicate SKUs within this product
          if (allVariantSkus.includes(variant.sku)) {
            throw ApiError.validation(`Duplicate variant SKU: ${variant.sku}`);
          }
          allVariantSkus.push(variant.sku);

          // Check global SKU uniqueness (exclude current product)
          const checkSkuExists = async (sku, excludeId) => {
            const Product = require("./product.model");
            const query = {
              $or: [{ sku: sku }, { "variants.sku": sku }],
            };
            if (excludeId) {
              query._id = { $ne: excludeId };
            }
            const existing = await Product.findOne(query);
            return !!existing;
          };

          const skuExists = await checkSkuExists(variant.sku, productId);
          if (skuExists) {
            throw ApiError.validation(
              `Variant SKU already exists: ${variant.sku}`
            );
          }
        }
      }
    }

    const updatedProduct = await productRepository.updateById(
      productId,
      updateData
    );
    return updatedProduct;
  }

  /**
   * Delete product
   */
  async deleteProduct(productId) {
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    await productRepository.deleteById(productId);
    return { success: true };
  }

  /**
   * Update product status
   */
  async updateProductStatus(productId, status) {
    const product = await productRepository.findById(productId);

    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const validStatuses = ["draft", "published", "archived"];
    if (!validStatuses.includes(status)) {
      throw ApiError.validation(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const updatedProduct = await productRepository.updateStatus(
      productId,
      status
    );
    return updatedProduct;
  }

  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(productIds, status) {
    const validStatuses = ["draft", "published", "archived"];
    if (!validStatuses.includes(status)) {
      throw ApiError.validation(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const result = await productRepository.bulkUpdateStatus(productIds, status);
    return result;
  }

  /**
   * Search products
   * @param {string} searchTerm - Search term
   * @param {Object} options - { page, limit, product_type }
   */
  async searchProducts(searchTerm, options = {}) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      throw ApiError.badRequest("Search term is required");
    }

    const result = await productRepository.search(searchTerm.trim(), {
      page: options.page || 1,
      limit: options.limit || 20,
      product_type: options.product_type, // Pass through for bundle child picker
    });

    result.data = await attachReviewStats(result.data);
    return result;
  }

  /**
   * Check if SKU is available (not in use)
   */
  async checkSkuAvailable(sku, excludeProductId = null) {
    if (!sku) {
      throw ApiError.badRequest("SKU is required");
    }

    const Product = require("./product.model");
    const query = {
      $or: [{ sku: sku }, { "variants.sku": sku }],
    };

    if (excludeProductId) {
      query._id = { $ne: excludeProductId };
    }

    const existing = await Product.findOne(query);
    return !existing;
  }

  /**
   * Check if URL key is available (not in use)
   */
  async checkUrlKeyAvailable(urlKey, excludeProductId = null) {
    if (!urlKey) {
      throw ApiError.badRequest("URL key is required");
    }

    const query = { url_key: urlKey };
    if (excludeProductId) {
      query._id = { $ne: excludeProductId };
    }

    const existing = await productRepository.findOne(query);
    return !existing;
  }

  /**
   * Generate SKU suggestion for product
   */
  async generateSkuSuggestion(productName, options = {}) {
    if (!productName) {
      throw ApiError.badRequest("Product name is required");
    }

    const baseSku = suggestProductSku(productName, options);

    const checkSkuExists = async (sku) => {
      return !(await this.checkSkuAvailable(sku));
    };

    const uniqueSku = await generateUniqueSku(baseSku, checkSkuExists);
    return uniqueSku;
  }

  /**
   * Generate variant SKU suggestion
   */
  generateVariantSkuSuggestion(baseSku, variantOptions, config = {}) {
    if (!baseSku) {
      throw ApiError.badRequest("Base SKU is required");
    }

    return generateVariantSku(baseSku, variantOptions, config);
  }

  /**
   * Lock product SKU (called when used in orders)
   */
  async lockProductSku(productId) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    await productRepository.updateById(productId, { skuLocked: true });
    return { success: true };
  }

  /**
   * Lock variant SKU (called when used in orders)
   */
  async lockVariantSku(productId, variantId) {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw ApiError.notFound("Product not found");
    }

    const variantIndex = product.variants.findIndex((v) => v.id === variantId);
    if (variantIndex === -1) {
      throw ApiError.notFound("Variant not found");
    }

    const updateData = {};
    updateData[`variants.${variantIndex}.skuLocked`] = true;

    await productRepository.updateById(productId, updateData);
    return { success: true };
  }
}

module.exports = new ProductService();
