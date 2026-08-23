const Product = require("../../models/Product");
const redis = require("../../config/redis");
const logger = require("../../utils/logger");

const CACHE_TTL_SECONDS = 120;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;

const CACHE_PREFIX = "search:suggest:v1";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getMinPrice = (product) => {
  const parentPrice = product.pricing?.price || product.price || 0;
  let minPrice = parentPrice;
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const variantPrices = product.variants
      .map((variant) => variant.pricing?.price || variant.price || 0)
      .filter((price) => price > 0);
    if (variantPrices.length > 0) minPrice = Math.min(...variantPrices);
  } else if (parentPrice === 0 && product.price) {
    minPrice = product.price;
  }
  return minPrice;
};

const toSuggestion = (product, category = null) => ({
  id: String(product._id),
  title: product.title || product.name || "",
  url_key: product.url_key,
  price: getMinPrice(product),
  image:
    typeof product.images?.[0] === "string" ? product.images[0] : "",
  category: category || product.category?.name || "Uncategorized",
});

/**
 * GET /api/v1/product/search/suggest?q=<term>&limit=<n>
 *
 * Lightweight typeahead endpoint for the storefront search overlay.
 * - Prefix-first matching on title / variant names (+ SKU legs)
 * - Substring fallback when prefix results are thin
 * - Exact SKU hit short-circuits with exactMatch: true (client jumps straight to PDP)
 * - Redis-cached per normalized query; Redis failures never break search
 */
const searchSuggest = async (req, res) => {
  try {
    const rawQuery = String(req.query.q ?? "").trim();
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const normalized = rawQuery.toLowerCase().replace(/\s+/g, " ");

    if (normalized.length < MIN_QUERY_LENGTH) {
      return res.status(200).json({
        success: true,
        query: normalized,
        products: [],
        total: 0,
      });
    }

    // ── Cache lookup ────────────────────────────────────────────────
    const cacheKey = `${CACHE_PREFIX}:${limit}:${normalized}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }
    } catch (cacheError) {
      logger.warn("⚠️ Suggest cache read failed:", cacheError.message);
    }

    const escaped = escapeRegExp(normalized);
    const prefixRegex = new RegExp(`^${escaped}`, "i");
    const containsRegex = new RegExp(escaped, "i");
    const isSkuLike = /^[a-z0-9-]+$/.test(normalized);

    const baseSelect =
      "title name url_key images pricing price sku variants.sku variants.name variants.pricing variants.price category";

    // ── Exact SKU short-circuit ─────────────────────────────────────
    if (isSkuLike) {
      const exactSkuProduct = await Product.findOne({
        status: "published",
        $or: [
          { sku: prefixRegex },
          { "variants.sku": prefixRegex },
        ],
      })
        .select(baseSelect)
        .populate("category", "name")
        .lean();

      const hasExactSku =
        exactSkuProduct &&
        [exactSkuProduct.sku, ...(exactSkuProduct.variants || []).map((v) => v.sku)]
          .filter(Boolean)
          .some((sku) => sku.toLowerCase() === normalized);

      if (hasExactSku) {
        const payload = {
          success: true,
          query: normalized,
          products: [toSuggestion(exactSkuProduct)],
          total: 1,
          exactMatch: true,
        };
        try {
          await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
        } catch (cacheError) {
          logger.warn("⚠️ Suggest cache write failed:", cacheError.message);
        }
        return res.status(200).json(payload);
      }
    }

    // ── Phase A: prefix matches (title / name / variant name) ───────
    let docs = await Product.find({
      status: "published",
      $or: [
        { title: prefixRegex },
        { name: prefixRegex },
        { "variants.name": prefixRegex },
      ],
    })
      .select(baseSelect)
      .populate("category", "name")
      .limit(limit * 2)
      .lean();

    // ── Phase B: substring fallback to fill remaining slots ─────────
    if (docs.length < limit) {
      const seenIds = new Set(docs.map((doc) => String(doc._id)));
      const extraDocs = await Product.find({
        status: "published",
        _id: { $nin: Array.from(seenIds) },
        $or: [
          { title: containsRegex },
          { name: containsRegex },
          { "variants.name": containsRegex },
        ],
      })
        .select(baseSelect)
        .populate("category", "name")
        .limit(limit - docs.length + Math.ceil(limit / 2))
        .lean();
      docs = [...docs, ...extraDocs];
    }

    // ── Rank: prefix > word-boundary > substring; shorter title wins ─
    const rank = (title) => {
      const lowerTitle = (title || "").toLowerCase();
      if (lowerTitle.startsWith(normalized)) return 0;
      if (lowerTitle.includes(` ${normalized}`)) return 1;
      if (lowerTitle.includes(normalized)) return 2;
      return 3;
    };

    const products = docs
      .map((doc) => ({ doc, suggestion: toSuggestion(doc) }))
      .sort(
        (a, b) =>
          rank(a.suggestion.title) - rank(b.suggestion.title) ||
          a.suggestion.title.length - b.suggestion.title.length ||
          a.suggestion.title.localeCompare(b.suggestion.title)
      )
      .slice(0, limit)
      .map((entry) => entry.suggestion);

    const payload = {
      success: true,
      query: normalized,
      products,
      total: products.length,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL_SECONDS);
    } catch (cacheError) {
      logger.warn("⚠️ Suggest cache write failed:", cacheError.message);
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger.error("❌ Search suggest error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = searchSuggest;
