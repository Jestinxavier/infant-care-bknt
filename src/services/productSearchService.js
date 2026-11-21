const {
  getProductsIndex,
  isMeilisearchEnabled,
} = require("../config/meilisearch");
const { tokenizeSearchTerm, buildTokenRegex } = require("../utils/searchTerms");
const logger = require("../utils/logger");

/**
 * Storefront search via Meilisearch: returns the matching product ids in
 * relevance order, or null when the caller should use the MongoDB regex
 * search instead (Meilisearch not configured, down, slow, or no hits).
 *
 * Used by the search listing (product.service getAllProducts) and the filter
 * sidebar counts (getFilters) so both always see the same products.
 */

const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS) || 800;
const MAX_SEARCH_HITS = 5000;

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref?.()
    ),
  ]);

/**
 * Products whose category matches a search word go first, keeping
 * Meilisearch's order within each group: "diaper" lists the "Diapering &
 * Nappies" products before the "Jhabla & Nappy" sets in "Sets & Combos".
 */
const categoryFirst = (hits, searchTerm) => {
  const regexes = tokenizeSearchTerm(searchTerm)
    .map((token) => buildTokenRegex(token))
    .filter(Boolean)
    .map(({ $regex, $options }) => new RegExp($regex, $options));
  if (regexes.length === 0) return hits;

  const inCategory = (hit) =>
    [hit.category, hit.parentCategory].some(
      (name) => typeof name === "string" && regexes.some((re) => re.test(name))
    );

  const first = [];
  const rest = [];
  for (const hit of hits) (inCategory(hit) ? first : rest).push(hit);
  return [...first, ...rest];
};

const findSearchProductIds = async (searchTerm) => {
  const term = String(searchTerm || "").trim();
  if (!term || !isMeilisearchEnabled()) return null;

  try {
    const result = await withTimeout(
      getProductsIndex().search(term, {
        limit: MAX_SEARCH_HITS,
        filter: 'status = "published"',
        // Every word must match, as the regex search requires. Typos,
        // synonyms and joined/split words are still forgiven.
        matchingStrategy: "all",
        attributesToRetrieve: ["id", "category", "parentCategory"],
      }),
      SEARCH_TIMEOUT_MS
    );

    const hits = result?.hits || [];
    // No hits: let the regex search try. It also reads descriptions, so it
    // can still find something for rare words only found there.
    if (hits.length === 0) return null;

    return categoryFirst(hits, term).map((hit) => String(hit.id));
  } catch (error) {
    logger.warn(`[Search] Meilisearch failed, using MongoDB search: ${error.message}`);
    return null;
  }
};

module.exports = { findSearchProductIds, categoryFirst };
