const { MeiliSearch } = require("meilisearch");
const logger = require("../utils/logger");

/**
 * Optional Meilisearch client for storefront search.
 *
 * The entire search stack degrades gracefully: when MEILISEARCH_HOST is not
 * configured, `isMeilisearchEnabled` is false and the suggest endpoint falls
 * back to MongoDB regex matching. Nothing else in the app is affected.
 */

const PRODUCTS_INDEX_NAME = process.env.MEILISEARCH_PRODUCTS_INDEX || "products";

let client = null;

if (process.env.MEILISEARCH_HOST) {
  try {
    client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_API_KEY || "",
    });
    logger.info(`[Meilisearch] configured at ${process.env.MEILISEARCH_HOST}`);
  } catch (error) {
    logger.error("[Meilisearch] init failed — search falls back to MongoDB:", error.message);
    client = null;
  }
} else {
  logger.info("[Meilisearch] not configured — search uses MongoDB fallback");
}

const isMeilisearchEnabled = () => Boolean(client);

const getProductsIndex = () => {
  if (!client) return null;
  return client.index(PRODUCTS_INDEX_NAME);
};

module.exports = {
  client,
  PRODUCTS_INDEX_NAME,
  isMeilisearchEnabled,
  getProductsIndex,
};
