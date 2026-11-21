const Product = require("../models/Product");
// Registered here because indexing populates categories (and parents).
const Category = require("../models/Category");
const {
  getProductsIndex,
  isMeilisearchEnabled,
} = require("../config/meilisearch");
const logger = require("../utils/logger");

/**
 * Keeps the Meilisearch "products" index in sync with MongoDB.
 *
 * Design rules:
 * - Every function is safe to call fire-and-forget: failures are logged,
 *   never thrown into request paths (search sync must not break admin ops).
 * - Only published products live in the index; unpublishing/deleting a
 *   product removes it.
 * - The index decides which products match a search and in what order. The
 *   listing then loads those ids from MongoDB and applies filters, stock and
 *   pricing there, so only searchable text lives here (plus suggest fields).
 * - Descriptions are NOT indexed: promo text such as "5 sleep suits + 5 free
 *   knot Jabalas" made unrelated products match.
 */

// Same garment or item, different words. Multi-way: each word finds the others.
// Meilisearch has no plural handling, and a plural 2+ letters off ("nappies"
// vs "nappy") is beyond typo tolerance, so plurals sit in the same group.
const SYNONYM_GROUPS = [
  ["jabala", "jabalas", "jhabla", "jhablas", "jabla", "jablas", "jhabala", "jhabalas"],
  ["nappy", "nappies", "diaper", "diapers"],
  ["frock", "frocks", "dress", "dresses"],
  ["romper", "onesie", "jumpsuit", "bodysuit"],
  ["coord", "co-ord", "cord set"],
  ["sleepsuit", "sleepsuits", "sleep suit", "sleep suits"],
  ["newborn", "new born"],
  ["tshirt", "t-shirt", "tee"],
];

const buildSynonyms = () => {
  const synonyms = {};
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      synonyms[word] = group.filter((other) => other !== word);
    }
  }
  return synonyms;
};

const INDEX_SETTINGS = {
  // Order matters: a title match ranks above a category or size match.
  searchableAttributes: [
    "title",
    "category",
    "parentCategory",
    "variantNames",
    "skus",
    "sku",
    "sizes",
  ],
  filterableAttributes: ["status", "category"],
  sortableAttributes: ["price", "title"],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
  synonyms: buildSynonyms(),
  // One typo from 4 letters ("frok" -> frock), two from 8. 3-letter words
  // ("bib", "cap", "kit") must match exactly.
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
    // SKUs match exactly: "DRES-FRCK-5E4F08" must not match "frock".
    disableOnAttributes: ["sku", "skus"],
  },
  // Default 1000 would cut off broad searches such as "print".
  pagination: { maxTotalHits: 5000 },
};

const PRODUCT_FIELDS =
  "title name url_key images pricing price category status sku variants.sku variants.name filterAttributes.size";

const CATEGORY_POPULATE = {
  path: "category",
  select: "name parentCategory",
  populate: { path: "parentCategory", select: "name" },
};

const uniqueStrings = (values) => [
  ...new Set(values.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim())),
];

const transformToIndexDoc = (product) => ({
  id: String(product._id),
  title: product.title || product.name || "",
  url_key: product.url_key,
  price: product.pricing?.price || product.price || 0,
  image: typeof product.images?.[0] === "string" ? product.images[0] : "",
  category: product.category?.name || "Uncategorized",
  parentCategory: product.category?.parentCategory?.name || "",
  variantNames: uniqueStrings((product.variants || []).map((v) => v.name)),
  sizes: uniqueStrings(product.filterAttributes?.size || []),
  status: product.status,
  sku: product.sku || null,
  skus: uniqueStrings([
    product.sku,
    ...(product.variants || []).map((v) => v.sku),
  ]),
});

// Settings are applied once per process (and on every full reindex). Sending
// them on every sync queued a settings task in Meilisearch each time.
let settingsApplied = null;
const configureIndex = async ({ force = false } = {}) => {
  const index = getProductsIndex();
  if (!index) return;
  if (!settingsApplied || force) {
    settingsApplied = index.updateSettings(INDEX_SETTINGS).catch((error) => {
      settingsApplied = null;
      throw error;
    });
  }
  await settingsApplied;
};

const loadProducts = (query) =>
  Product.find(query).select(PRODUCT_FIELDS).populate(CATEGORY_POPULATE).lean();

/** Index (or re-index) the given product ids from MongoDB. */
const syncProductsByIds = async (ids) => {
  if (!isMeilisearchEnabled() || !ids?.length) return;

  try {
    const uniqueIds = [...new Set(ids.map(String))];
    const docs = await loadProducts({ _id: { $in: uniqueIds } });

    const index = getProductsIndex();

    // Docs missing/unpublished in Mongo get deleted from the index instead.
    const toUpsert = [];
    const toDelete = [];
    const docMap = new Map(docs.map((doc) => [String(doc._id), doc]));

    for (const id of uniqueIds) {
      const doc = docMap.get(id);
      if (doc && doc.status === "published") {
        toUpsert.push(transformToIndexDoc(doc));
      } else {
        toDelete.push(id);
      }
    }

    await configureIndex();
    if (toUpsert.length > 0)
      await index.addDocuments(toUpsert, { primaryKey: "id" });
    if (toDelete.length > 0) await index.deleteDocuments(toDelete);
    logger.info(
      `[SearchIndex] synced ${toUpsert.length} upserted, ${toDelete.length} removed`
    );
  } catch (error) {
    logger.error("[SearchIndex] sync failed:", error.message);
  }
};

/** Re-index every product in a category (and its child categories), e.g.
 * after a rename: the index stores category names. */
const syncProductsInCategory = async (categoryId) => {
  if (!isMeilisearchEnabled() || !categoryId) return;
  try {
    const childIds = await Category.find({ parentCategory: categoryId }).distinct("_id");
    const ids = await Product.find({
      category: { $in: [categoryId, ...childIds] },
    }).distinct("_id");
    if (ids.length > 0) await syncProductsByIds(ids);
  } catch (error) {
    logger.error("[SearchIndex] category sync failed:", error.message);
  }
};

const removeProductsByIds = async (ids) => {
  if (!isMeilisearchEnabled() || !ids?.length) return;
  try {
    await getProductsIndex().deleteDocuments(ids.map(String));
  } catch (error) {
    logger.error("[SearchIndex] delete failed:", error.message);
  }
};

/**
 * Full rebuild — used by the admin reindex endpoint and the nightly job.
 * Upserts every published product, then removes ids that are no longer
 * published. The index is never emptied, so search keeps working throughout.
 */
const reindexAllProducts = async () => {
  if (!isMeilisearchEnabled()) {
    throw new Error("Meilisearch is not configured (MEILISEARCH_HOST missing)");
  }

  const index = getProductsIndex();
  await configureIndex({ force: true });

  let indexed = 0;
  const batchSize = 500;
  const publishedIds = new Set();
  const cursor = Product.find({ status: "published" })
    .select(PRODUCT_FIELDS)
    .populate(CATEGORY_POPULATE)
    .lean()
    .cursor();

  let batch = [];
  for await (const doc of cursor) {
    publishedIds.add(String(doc._id));
    batch.push(transformToIndexDoc(doc));
    if (batch.length >= batchSize) {
      await index.addDocuments(batch, { primaryKey: "id" });
      indexed += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await index.addDocuments(batch, { primaryKey: "id" });
    indexed += batch.length;
  }

  // Remove documents that are no longer published (or were deleted).
  const stale = [];
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const page = await index.getDocuments({ fields: ["id"], limit: pageSize, offset });
    for (const doc of page.results) {
      if (!publishedIds.has(String(doc.id))) stale.push(String(doc.id));
    }
    offset += page.results.length;
    if (page.results.length < pageSize) break;
  }
  if (stale.length > 0) await index.deleteDocuments(stale);

  logger.info(
    `[SearchIndex] full reindex complete — ${indexed} products, ${stale.length} stale removed`
  );
  return indexed;
};

/** Nightly safety net: catches any product change that skipped a sync
 * (direct DB edits, a failed sync while Meilisearch was down, ...). Also runs
 * once shortly after startup, so a deploy that changes INDEX_SETTINGS or the
 * document shape takes effect without a manual reindex. */
const startSearchReindexCron = () => {
  if (!isMeilisearchEnabled()) return;
  const cron = require("node-cron");
  const expression = process.env.SEARCH_REINDEX_CRON || "30 3 * * *";
  const run = async (reason) => {
    try {
      await reindexAllProducts();
    } catch (error) {
      logger.error(`[SearchIndex] ${reason} reindex failed:`, error.message);
    }
  };
  cron.schedule(expression, () => run("nightly"));
  setTimeout(() => run("startup"), 30 * 1000).unref();
  logger.info(`[SearchIndex] reindex on startup and nightly (${expression})`);
};

module.exports = {
  INDEX_SETTINGS,
  transformToIndexDoc,
  syncProductsByIds,
  syncProductsInCategory,
  removeProductsByIds,
  reindexAllProducts,
  startSearchReindexCron,
};
