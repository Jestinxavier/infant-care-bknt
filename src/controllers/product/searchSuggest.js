const Product = require("../../models/Product");
const redis = require("../../config/redis");
const logger = require("../../utils/logger");
const {
  getProductsIndex,
  isMeilisearchEnabled,
} = require("../../config/meilisearch");

const CACHE_TTL_SECONDS = 120;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;

const CACHE_PREFIX = "search:suggest:v2";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Meilisearch-backed suggest (typo tolerance + prefix + synonyms).
 * Response shape is identical to the Mongo fallback path.
 */
const suggestViaMeilisearch = async (normalized, limit) => {
  const index = getProductsIndex();
  const result = await index.search(normalized, {
    limit,
    filter: 'status = "published"',
  });

  const products = (result.hits || []).map((hit) => ({
    id: hit.id,
    title: hit.title || "",
    url_key: hit.url_key,
    price: hit.price || 0,
    image: hit.image || "",
    category: hit.category || "Uncategorized",
  }));

  const payload = {
    success: true,
    query: normalized,
    products,
    total: products.length,
  };

  // Exact-SKU detection without an extra Mongo roundtrip — the index
  // carries sku/skus attributes for this purpose.
  if (/^[a-z0-9-]+$/.test(normalized) && products.length > 0) {
    const firstHitSkus = [
      ...(result.hits[0].sku ? [result.hits[0].sku] : []),
      ...(result.hits[0].skus || []),
    ];
    if (
      firstHitSkus.some((sku) => String(sku).toLowerCase() === normalized)
    ) {
      payload.products = products.slice(0, 1);
      payload.total = 1;
      payload.exactMatch = true;
    }
  }

  return payload;
};

// ── MongoDB fallback ─────────────────────────────────────────────────
// Token-aware, metadata-aware matching so natural queries work:
//   "white rompers"       → color:"white" + title/category romper*
//   "boy baby night dress" → gender:"boy" + night + dress
// Every token must match at least one searchable path (AND); when that is
// too strict we relax to ANY-token matching ranked by hit quality.
const SEARCHABLE_PATHS = [
  "title",
  "name",
  "categoryName",
  "categoryCode",
  "collections",
  "badgeCollection",
  "filterAttributes.color",
  "filterAttributes.size",
  "filterAttributes.material",
  "filterAttributes.season",
  "filterAttributes.gender",
  "filterAttributes.sleeve",
  "filterAttributes.occasion",
  "filterAttributes.pattern",
  "filterAttributes.pack",
  "variants.name",
];

const BASE_SELECT =
  "title name url_key images pricing price sku categoryName categoryCode collections badgeCollection filterAttributes variants.sku variants.name variants.pricing variants.price category";

const buildTokenRegexes = (tokens) =>
  tokens.map((token, i) => {
    const isLast = i === tokens.length - 1;
    let source = escapeRegExp(token);
    // Naive plural handling: "rompers" → /rompers?/i also matches "romper"
    if (token.length > 3 && token.endsWith("s")) {
      source = `${escapeRegExp(token.slice(0, -1))}s?`;
    }
    // Last token keeps its typeahead prefix tail: "dre" matches "dress"
    if (isLast && token.length >= 2) {
      source = `${source}\\w*`;
    }
    return new RegExp(source, "i");
  });

const rankAndSlice = (docs, tokenRegexes, tokens, limit) => {
  const primaryText = (doc) =>
    `${doc.title || doc.name || ""} ${doc.categoryName || ""}`.toLowerCase();
  const metaText = (doc) => {
    const attrs = doc.filterAttributes || {};
    return [
      ...(Array.isArray(doc.collections) ? doc.collections : []),
      doc.badgeCollection || "",
      ...Object.values(attrs).flatMap((v) => (Array.isArray(v) ? v : [v])),
    ]
      .join(" ")
      .toLowerCase();
  };

  const scoreDoc = (doc) => {
    const primary = primaryText(doc);
    const meta = metaText(doc);
    let primaryHits = 0;
    let metaOnlyHits = 0;
    for (const regex of tokenRegexes) {
      if (regex.test(primary)) primaryHits += 1;
      else if (regex.test(meta)) metaOnlyHits += 1;
    }
    return {
      matchedAll: primaryHits + metaOnlyHits === tokens.length ? 1 : 0,
      primaryHits,
      metaOnlyHits,
      titleLength: (doc.title || "").length,
    };
  };

  return docs
    .map((doc) => ({ suggestion: toSuggestion(doc), score: scoreDoc(doc) }))
    .sort(
      (a, b) =>
        b.score.matchedAll - a.score.matchedAll ||
        b.score.primaryHits - a.score.primaryHits ||
        b.score.metaOnlyHits - a.score.metaOnlyHits ||
        a.score.titleLength - b.score.titleLength ||
        a.suggestion.title.localeCompare(b.suggestion.title)
    )
    .slice(0, limit)
    .map((entry) => entry.suggestion);
};

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

    // ── Meilisearch path (typo tolerance, prefix, synonyms) ─────────
    if (isMeilisearchEnabled()) {
      try {
        const payload = await suggestViaMeilisearch(normalized, limit);
        try {
          await redis.set(
            cacheKey,
            JSON.stringify(payload),
            "EX",
            CACHE_TTL_SECONDS
          );
        } catch (cacheError) {
          logger.warn("⚠️ Suggest cache write failed:", cacheError.message);
        }
        return res.status(200).json(payload);
      } catch (searchError) {
        // Engine hiccup must not break search — fall through to MongoDB.
        logger.error(
          "❌ Meilisearch suggest failed, using Mongo fallback:",
          searchError.message
        );
      }
    }

    const escaped = escapeRegExp(normalized);
    const prefixRegex = new RegExp(`^${escaped}`, "i");
    const isSkuLike = /^[a-z0-9-]+$/.test(normalized);

    // ── Exact SKU short-circuit ─────────────────────────────────────
    if (isSkuLike) {
      const exactSkuProduct = await Product.findOne({
        status: "published",
        $or: [{ sku: prefixRegex }, { "variants.sku": prefixRegex }],
      })
        .select(BASE_SELECT)
        .populate("category", "name")
        .lean();

      const hasExactSku =
        exactSkuProduct &&
        [
          exactSkuProduct.sku,
          ...(exactSkuProduct.variants || []).map((v) => v.sku),
        ]
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
          await redis.set(
            cacheKey,
            JSON.stringify(payload),
            "EX",
            CACHE_TTL_SECONDS
          );
        } catch (cacheError) {
          logger.warn("⚠️ Suggest cache write failed:", cacheError.message);
        }
        return res.status(200).json(payload);
      }
    }

    const tokens = normalized.split(" ").filter(Boolean);
    const tokenRegexes = buildTokenRegexes(tokens);

    // ── Phase A: every token must match somewhere ───────────────────
    let docs = await Product.find({
      status: "published",
      $and: tokenRegexes.map((regex) => ({
        $or: SEARCHABLE_PATHS.map((path) => ({ [path]: regex })),
      })),
    })
      .select(BASE_SELECT)
      .populate("category", "name")
      .limit(limit * 3)
      .lean();

    // ── Phase B: relax to any-token when AND is too strict ──────────
    if (docs.length === 0 && tokens.length > 1) {
      docs = await Product.find({
        status: "published",
        $or: SEARCHABLE_PATHS.flatMap((path) =>
          tokenRegexes.map((regex) => ({ [path]: regex }))
        ),
      })
        .select(BASE_SELECT)
        .populate("category", "name")
        .limit(limit * 3)
        .lean();
    }

    const products = rankAndSlice(docs, tokenRegexes, tokens, limit);

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
