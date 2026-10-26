const { cacheDelPattern } = require("./redisCache");
const logger = require("./logger");

/**
 * Flush storefront caches that derive from the product catalog. Call after any
 * product create/update/delete/bulk-delete so category filter facets
 * (`filters:config:*`) and autocomplete (`search:suggest:*`) don't serve stale
 * data until TTL expiry.
 */
async function invalidateProductCatalogCaches(reason = "product mutation") {
  try {
    await Promise.all([
      cacheDelPattern("filters:config:*"),
      cacheDelPattern("search:suggest:*"),
    ]);
  } catch (err) {
    logger.error("Product catalog cache invalidation failed", {
      reason,
      error: err.message,
    });
  }
}

module.exports = { invalidateProductCatalogCaches };
