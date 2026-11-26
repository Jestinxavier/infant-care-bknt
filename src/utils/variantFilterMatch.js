/**
 * Variant-level filter matching for the storefront listing and its facets.
 *
 * A CONFIGURABLE product's `filterAttributes` hold the union of all its
 * variants' values (e.g. size: [0-3-months, 3-6-months]). Filtering on that
 * alone lists a product when ANY variant has the chosen size, even if that
 * size is sold out — the shopper then lands on the PDP, which opens a
 * different (in-stock) size. These helpers check the chosen values against
 * each variant instead, so stock is judged on the variant that matches.
 *
 * Rule: for every selected filter key that a variant actually has as an
 * attribute (size, color, ...), the variant's value must be one of the chosen
 * values. Keys the variant doesn't have (e.g. "material" when it's a
 * product-level attribute) are left to the product-level filterAttributes
 * match, as before.
 */
const {
  FILTER_ATTRIBUTE_KEYS,
  normalizeFilterValue,
  normalizeFilterArray,
} = require("./filterAttributes");

// Variant attribute names that feed each filter key. Legacy products store
// size under "age" (see deriveColorAndSizeFromVariants).
const VARIANT_KEY_ALIASES = { size: ["size", "age"] };

const keyMatches = (attrKey, filterKey) =>
  (VARIANT_KEY_ALIASES[filterKey] || [filterKey]).includes(
    String(attrKey || "").trim().toLowerCase()
  );

const toPlainObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return typeof value === "object" ? value : {};
};

/** { key: Set(canonical values) } for every filter key with a selection. */
const getSelectedVariantFilters = (filters = {}) => {
  const selected = {};
  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(filters, key)) return;
    const values = normalizeFilterArray(filters[key], key);
    if (values.length > 0) selected[key] = new Set(values);
  });
  return selected;
};

/**
 * The variant's raw value for a filter key, or undefined when the variant
 * doesn't have that attribute at all. (A present-but-empty value counts as
 * present, matching the `$exists` check in the aggregation stage below.)
 */
const getVariantValue = (variant, key) => {
  for (const source of [variant?.attributes, variant?.options]) {
    for (const [attrKey, attrValue] of Object.entries(toPlainObject(source))) {
      if (keyMatches(attrKey, key)) return attrValue ?? "";
    }
  }
  return undefined;
};

/**
 * True when the variant satisfies every selected key it has a value for.
 * `exceptKey` skips one key — used for facet counts, so the other sizes of a
 * product still count while a size is selected.
 */
const variantMatchesFilters = (variant, selected, exceptKey = null) =>
  Object.entries(selected).every(([key, values]) => {
    if (key === exceptKey) return true;
    const raw = getVariantValue(variant, key);
    if (raw === undefined) return true;
    return values.has(normalizeFilterValue(raw, key));
  });

/**
 * Same stock rule as the listing aggregation's `isInStock`: when `stockObj`
 * exists, `available` decides if present (so { available: 0, isInStock: true }
 * is out of stock), otherwise the isInStock flag; else the raw `stock` number.
 */
const isVariantInStock = (variant) => {
  const stockObj = variant?.stockObj;
  if (stockObj) {
    if (stockObj.available !== undefined) return stockObj.available > 0;
    return stockObj.isInStock === true;
  }
  return (variant?.stock || 0) > 0;
};

// ---------------------------------------------------------------------------
// Aggregation stage
//
// MongoDB can't run the JS normaliser (aliases such as "3-6M" → "3-6-months"),
// so the distinct variant attribute values in the catalogue are read once,
// normalised here, and the raw values that match a selection go into an $in.
// Cached briefly: a new raw spelling surfaces within a minute.
// ---------------------------------------------------------------------------
const PAIRS_CACHE_MS = 60 * 1000;
let pairsCache = { at: 0, pairs: null };

const clearVariantAttributeCache = () => {
  pairsCache = { at: 0, pairs: null };
};

/** Distinct { source: "attributes"|"options", key, value } across variants. */
const loadVariantAttributePairs = async () => {
  if (pairsCache.pairs && Date.now() - pairsCache.at < PAIRS_CACHE_MS) {
    return pairsCache.pairs;
  }
  const Product = require("../models/Product");
  const tagged = (field, source) => ({
    $map: {
      input: { $objectToArray: { $ifNull: [`$variants.${field}`, {}] } },
      as: "kv",
      in: { s: source, k: "$$kv.k", v: "$$kv.v" },
    },
  });
  const rows = await Product.aggregate([
    { $match: { "variants.0": { $exists: true } } },
    { $unwind: "$variants" },
    {
      $project: {
        kv: {
          $concatArrays: [tagged("attributes", "attributes"), tagged("options", "options")],
        },
      },
    },
    { $unwind: "$kv" },
    { $group: { _id: { s: "$kv.s", k: "$kv.k", v: "$kv.v" } } },
  ]);
  const pairs = rows.map((row) => ({
    source: row._id.s,
    key: row._id.k,
    value: row._id.v,
  }));
  pairsCache = { at: Date.now(), pairs };
  return pairs;
};

/**
 * A `$match` for the listing pipeline, placed right after `$unwind: variants`.
 * Keeps non-configurable rows, and configurable rows whose variant matches
 * the selection (or doesn't have the filtered attribute at all). Returns null
 * when no selected key is a variant attribute anywhere in the catalogue.
 */
const buildVariantFilterMatchStage = async (filters = {}) => {
  const selected = getSelectedVariantFilters(filters);
  if (Object.keys(selected).length === 0) return null;

  const pairs = await loadVariantAttributePairs();
  const perKeyClauses = [];

  Object.entries(selected).forEach(([key, values]) => {
    const fieldPaths = new Set();
    const matchingByPath = new Map();

    pairs.forEach(({ source, key: attrKey, value }) => {
      if (!keyMatches(attrKey, key)) return;
      const path = `variants.${source}.${attrKey}`;
      fieldPaths.add(path);
      if (values.has(normalizeFilterValue(value ?? "", key))) {
        if (!matchingByPath.has(path)) matchingByPath.set(path, []);
        matchingByPath.get(path).push(value);
      }
    });

    // No variant anywhere uses this key: it's product-level only.
    if (fieldPaths.size === 0) return;

    const lacksAttribute = {
      $and: [...fieldPaths].map((path) => ({ [path]: { $exists: false } })),
    };
    const hasChosenValue = [...matchingByPath].map(([path, raws]) => ({
      [path]: { $in: raws },
    }));
    perKeyClauses.push({ $or: [lacksAttribute, ...hasChosenValue] });
  });

  if (perKeyClauses.length === 0) return null;

  return {
    $match: {
      $or: [{ product_type: { $ne: "CONFIGURABLE" } }, { $and: perKeyClauses }],
    },
  };
};

module.exports = {
  getSelectedVariantFilters,
  getVariantValue,
  variantMatchesFilters,
  isVariantInStock,
  buildVariantFilterMatchStage,
  clearVariantAttributeCache,
};
