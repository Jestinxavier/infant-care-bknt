/**
 * Parse query parameters from new URL structure
 * Handles: ?page=1&price=554,999&color=blue,green&age=0-3,newborn&inStock=false&sort=price_low
 *
 * @param {Object} query - Express req.query object
 * @returns {Object} Parsed filter object
 */
const parseQueryFilters = (query) => {
  const filters = {
    page: query.page || 1,
    limit: query.limit || 20,
    sortBy: query.sort || query.sortBy, // Support both 'sort' and 'sortBy'
  };

  // Parse price range: price=554,999 -> minPrice=554, maxPrice=999
  if (query.price) {
    const priceParts = query.price.split(",").map((p) => parseFloat(p.trim()));
    if (
      priceParts.length === 2 &&
      !isNaN(priceParts[0]) &&
      !isNaN(priceParts[1])
    ) {
      filters.minPrice = Math.min(priceParts[0], priceParts[1]);
      filters.maxPrice = Math.max(priceParts[0], priceParts[1]);
    }
  } else {
    // Fallback to old format
    if (query.minPrice) filters.minPrice = parseFloat(query.minPrice);
    if (query.maxPrice) filters.maxPrice = parseFloat(query.maxPrice);
  }

  // Parse color: color=blue,green -> ['blue', 'green']
  if (query.color) {
    if (Array.isArray(query.color)) {
      filters.color = query.color;
    } else if (typeof query.color === "string" && query.color.includes(",")) {
      filters.color = query.color.split(",").map((c) => c.trim());
    } else {
      filters.color = [query.color.trim()];
    }
  }

  // Size filter (replaces legacy 'age' parameter)
  const sizeParam = query.size || query.s;
  if (sizeParam) {
    if (typeof sizeParam === "string" && sizeParam.includes(",")) {
      filters.size = sizeParam.split(",").map((s) => s.trim());
    } else {
      filters.size = [sizeParam.trim()];
    }
  }

  // Parse inStock: inStock=false -> 'false'
  if (query.inStock !== undefined) {
    filters.inStock =
      query.inStock === "true" || query.inStock === true ? "true" : "false";
  }

  // Keep other filters as-is
  if (query.category) filters.category = query.category;
  if (query.brand) filters.brand = query.brand;
  if (query.material) filters.material = query.material;
  if (query.pattern) filters.pattern = query.pattern;
  if (query.minRating) filters.minRating = parseFloat(query.minRating);

  return filters;
};

module.exports = { parseQueryFilters };
