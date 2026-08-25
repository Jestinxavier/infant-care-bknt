const logger = require("../../utils/logger");
const { reindexAllProducts } = require("../../services/searchIndexService");
const { isMeilisearchEnabled } = require("../../config/meilisearch");

/**
 * POST /api/v1/admin/products/reindex-search
 * Full rebuild of the Meilisearch products index from MongoDB.
 * Requires admin auth. Returns 503 when Meilisearch is not configured.
 */
const reindexSearchIndex = async (req, res) => {
  if (!isMeilisearchEnabled()) {
    return res.status(503).json({
      success: false,
      message:
        "Meilisearch is not configured — set MEILISEARCH_HOST (and MEILISEARCH_API_KEY) in the environment.",
    });
  }

  try {
    const indexedCount = await reindexAllProducts();
    return res.status(200).json({
      success: true,
      message: "Search index rebuilt successfully",
      indexed: indexedCount,
    });
  } catch (error) {
    logger.error("❌ Search reindex failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Search reindex failed",
    });
  }
};

module.exports = { reindexSearchIndex };
