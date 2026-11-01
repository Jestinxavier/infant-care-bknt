// utils/productIdentifiers.js
// Shared rules for product/variant SKUs and url_keys across create, update and
// CSV import, so every write path treats them the same way.
const Product = require("../models/Product");

const clean = (value) => (typeof value === "string" ? value.trim() : "");

/** Every url_key a product currently answers to (parent + variants). */
const collectLiveUrlKeys = (product) =>
  [product?.url_key, ...(product?.variants || []).map((v) => v?.url_key)]
    .map(clean)
    .filter(Boolean);

/** Every SKU a product currently owns (parent + variants). */
const collectSkus = (product) =>
  [product?.sku, ...(product?.variants || []).map((v) => v?.sku)]
    .map(clean)
    .filter(Boolean);

const withSession = (query, session) => (session ? query.session(session) : query);

/**
 * True when another product uses `urlKey`, live (parent or variant) or retired
 * (urlKeyHistory). Retired keys count as taken: reusing one would silently
 * send that product's old links to a different product.
 */
const isUrlKeyTaken = async (urlKey, { excludeProductId, session } = {}) => {
  const key = clean(urlKey);
  if (!key) return false;
  const query = {
    $or: [
      { url_key: key },
      { "variants.url_key": key },
      { "urlKeyHistory.urlKey": key },
    ],
  };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  return !!(await withSession(Product.findOne(query).select("_id").lean(), session));
};

/** True when another product owns `sku` as its parent or a variant SKU. */
const isSkuTaken = async (sku, { excludeProductId, session } = {}) => {
  const value = clean(sku);
  if (!value) return false;
  const query = { $or: [{ sku: value }, { "variants.sku": value }] };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  return !!(await withSession(Product.findOne(query).select("_id").lean(), session));
};

/**
 * Next urlKeyHistory after a save. Keys the product answered to before but no
 * longer does (renamed parent, renamed or removed variant) are retired so the
 * storefront can 301 them to the product. A key that is live again is
 * dropped from history.
 */
const buildUrlKeyHistory = (existingHistory, previousKeys, currentKeys) => {
  const current = new Set(currentKeys.map(clean).filter(Boolean));
  const history = (existingHistory || []).filter(
    (entry) => entry?.urlKey && !current.has(entry.urlKey),
  );
  const known = new Set(history.map((entry) => entry.urlKey));
  for (const key of previousKeys.map(clean).filter(Boolean)) {
    if (!current.has(key) && !known.has(key)) {
      history.push({ urlKey: key, createdAt: new Date() });
      known.add(key);
    }
  }
  return history;
};

/**
 * Bundles (other than `excludeProductId`) whose items or gift options point at
 * any of `skus`. Bundles reference products by exact SKU, so renaming or
 * removing one of these SKUs would break them.
 */
const findBundlesUsingSkus = async (skus, { excludeProductId, session } = {}) => {
  const list = [...new Set(skus.map(clean).filter(Boolean))];
  if (list.length === 0) return [];
  const query = {
    $or: [
      { "bundle_config.items.sku": { $in: list } },
      { "bundle_config.gift_slot.options.sku": { $in: list } },
    ],
  };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  const bundles = await withSession(
    Product.find(query).select("title sku bundle_config").lean(),
    session,
  );
  const wanted = new Set(list);
  return bundles.map((bundle) => {
    const used = [
      ...(bundle.bundle_config?.items || []).map((item) => item?.sku),
      ...(bundle.bundle_config?.gift_slot?.options || []).map((opt) => opt?.sku),
    ].filter((sku) => wanted.has(sku));
    return { title: bundle.title, sku: bundle.sku, skus: [...new Set(used)] };
  });
};

const describeBundleUsage = (bundles) =>
  bundles
    .map((b) => `"${b.title}" (uses ${b.skus.join(", ")})`)
    .join("; ");

module.exports = {
  collectLiveUrlKeys,
  collectSkus,
  isUrlKeyTaken,
  isSkuTaken,
  buildUrlKeyHistory,
  findBundlesUsingSkus,
  describeBundleUsage,
};
