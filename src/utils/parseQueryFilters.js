const { normalizeFilterArray } = require("./filterAttributes");

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

  const parseListParam = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.includes(",")) {
      return value.split(",").map((v) => v.trim());
    }
    if (typeof value === "string") return [value.trim()];
    return [];
  };

  // Parse filter attributes (all facets are stored/queried as slug arrays)
  const filterFacetKeys = [
    "color",
    "material",
    "season",
    "gender",
    "sleeve",
    "occasion",
    "pattern",
    "pack",
  ];
  filterFacetKeys.forEach((key) => {
    if (!query[key]) return;
    const normalized = normalizeFilterArray(parseListParam(query[key]), key);
    if (normalized.length > 0) filters[key] = normalized;
  });

  // Size filter (replaces legacy 'age' parameter)
  const sizeParam = query.size || query.s || query.age;
  if (sizeParam) {
    const normalized = normalizeFilterArray(parseListParam(sizeParam), "size");
    if (normalized.length > 0) filters.size = normalized;
  }

  // Parse inStock: inStock=false -> 'false'
  if (query.inStock !== undefined) {
    filters.inStock =
      query.inStock === "true" || query.inStock === true ? "true" : "false";
  }

  if (query.subCategories) {
    if (Array.isArray(query.subCategories)) {
      filters.subCategories = query.subCategories;
    } else if (
      typeof query.subCategories === "string" &&
      query.subCategories.includes(",")
    ) {
      filters.subCategories = query.subCategories.split(",").map((s) => s.trim());
    } else {
      filters.subCategories = [query.subCategories.trim()];
    }
  }

  // Keep other filters as-is
  if (query.category) {
    if (Array.isArray(query.category)) {
      filters.category = query.category;
    } else if (
      typeof query.category === "string" &&
      query.category.includes(",")
    ) {
      filters.category = query.category.split(",").map((c) => c.trim());
    } else {
      filters.category = query.category.trim();
    }
  }
  if (query.collection) {
    if (Array.isArray(query.collection)) {
      filters.collection = query.collection;
    } else if (
      typeof query.collection === "string" &&
      query.collection.includes(",")
    ) {
      filters.collection = query.collection.split(",").map((c) => c.trim());
    } else {
      filters.collection = query.collection.trim();
    }
  }
  if (query.brand) filters.brand = query.brand;
  if (query.minRating) filters.minRating = parseFloat(query.minRating);

  return filters;
};

module.exports = { parseQueryFilters };
