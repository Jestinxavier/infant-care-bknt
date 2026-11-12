/**
 * Shared SKU search helpers for the storefront search surfaces (typeahead
 * suggest, PLP listing, PLP filter facets).
 *
 * All three must agree on what an "exact SKU" query is. Before this module
 * each surface did its own thing: suggest matched root + variant SKUs, the
 * listing only matched `variants.sku` (so SIMPLE products were never found by
 * SKU) and ran the SKU through typo expansion (so near-miss SKUs pulled in
 * unrelated products). Clicking "View all" from a correct suggestion then
 * showed "No products found" or the wrong items.
 */
const Product = require("../models/Product");
const escapeRegex = require("./escapeRegex");

const SKU_PATHS = ["sku", "variants.sku"];

/**
 * A single token of letters/digits/hyphens/underscores that contains at least
 * one digit — e.g. "NEW--PRMM-689839", "0o2eag1ix-1787218019811". Plain words
 * ("romper", "t-shirt") are not treated as SKUs.
 */
const isSkuLikeTerm = (term = "") => {
  const value = String(term || "").trim();
  return (
    value.length >= 4 &&
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9_-]*$/i.test(value) &&
    /[0-9]/.test(value)
  );
};

/** Prefix match on root and variant SKUs (no typo expansion). */
const buildSkuPrefixClauses = (token = "") => {
  const regex = { $regex: `^${escapeRegex(token)}`, $options: "i" };
  return SKU_PATHS.map((path) => ({ [path]: regex }));
};

/**
 * Published products whose root SKU or any variant SKU equals `term`
 * (case-insensitive). Returns `[]` when the term is not SKU-like.
 */
const findExactSkuProductIds = async (term = "") => {
  const value = String(term || "").trim();
  if (!isSkuLikeTerm(value)) return [];

  // Fast path: indexed equality on the common casings.
  const casings = [...new Set([value, value.toUpperCase(), value.toLowerCase()])];
  let docs = await Product.find({
    status: "published",
    $or: SKU_PATHS.map((path) => ({ [path]: { $in: casings } })),
  })
    .select("_id")
    .lean();

  // Mixed-case SKUs: anchored case-insensitive match.
  if (docs.length === 0) {
    const exact = { $regex: `^${escapeRegex(value)}$`, $options: "i" };
    docs = await Product.find({
      status: "published",
      $or: SKU_PATHS.map((path) => ({ [path]: exact })),
    })
      .select("_id")
      .lean();
  }

  return docs.map((doc) => doc._id);
};

module.exports = {
  SKU_PATHS,
  isSkuLikeTerm,
  buildSkuPrefixClauses,
  findExactSkuProductIds,
};
