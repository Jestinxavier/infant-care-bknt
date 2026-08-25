const Product = require("../models/Product");
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
 * - Document shape mirrors the suggest API payload so mapping is trivial
 *   (plus sku/skus for exact-match detection).
 */

const transformToIndexDoc = (product) => ({
  id: String(product._id),
  title: product.title || product.name || "",
  url_key: product.url_key,
  price: product.pricing?.price || product.price || 0,
  image: typeof product.images?.[0] === "string" ? product.images[0] : "",
  category: product.category?.name || "Uncategorized",
  status: product.status,
  sku: product.sku || null,
  skus: [
    ...(product.sku ? [product.sku] : []),
    ...((product.variants || []).map((v) => v.sku).filter(Boolean)),
  ],
});

const configureIndex = async () => {
  const index = getProductsIndex();
  if (!index) return;

  await index.updateSettings({
    searchableAttributes: ["title", "skus", "sku", "category"],
    filterableAttributes: ["status", "category"],
    sortableAttributes: ["price", "title"],
    rankingRules: [
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
    ],
  });
};

/** Index (or re-index) the given product ids from MongoDB. */
const syncProductsByIds = async (ids) => {
  if (!isMeilisearchEnabled() || !ids?.length) return;

  try {
    const uniqueIds = [...new Set(ids.map(String))];
    const docs = await Product.find({ _id: { $in: uniqueIds } })
      .select(
        "title name url_key images pricing price category status sku variants.sku"
      )
      .populate("category", "name")
      .lean();

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

const removeProductsByIds = async (ids) => {
  if (!isMeilisearchEnabled() || !ids?.length) return;
  try {
    await getProductsIndex().deleteDocuments(ids.map(String));
  } catch (error) {
    logger.error("[SearchIndex] delete failed:", error.message);
  }
};

/** Full rebuild — used by the admin reindex endpoint. */
const reindexAllProducts = async () => {
  if (!isMeilisearchEnabled()) {
    throw new Error("Meilisearch is not configured (MEILISEARCH_HOST missing)");
  }

  const index = getProductsIndex();
  await configureIndex();
  await index.deleteAllDocuments();

  let indexed = 0;
  const batchSize = 500;
  let cursor = Product.find({ status: "published" })
    .select("title name url_key images pricing price category status sku variants.sku")
    .populate("category", "name")
    .lean()
    .cursor();

  let batch = [];
  for await (const doc of cursor) {
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

  logger.info(`[SearchIndex] full reindex complete — ${indexed} products`);
  return indexed;
};

module.exports = {
  syncProductsByIds,
  removeProductsByIds,
  reindexAllProducts,
};
