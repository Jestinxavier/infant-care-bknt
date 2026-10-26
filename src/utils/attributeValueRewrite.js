/**
 * Rewrites product/variant references to an allowed value after a merge.
 *
 * Products store attribute values as raw strings:
 *   - product.attributes.<code>              (Map<String>, Product.js)
 *   - product.variantOptions[].values[].value (variant-option vocabulary)
 *   - product.variants[].attributes.<code>   (Map<String>, Variant.js)
 *   - product.filterAttributes.<key>         (denormalized slugs, re-derived
 *                                             by the Product pre-save hook)
 *
 * Filter queries tolerate old spellings via alias expansion, but the stored
 * strings are what the storefront/admin *display*, so merges rewrite them to
 * the canonical label/value. filterAttributes are updated manually for
 * non-CONFIGURABLE products (their pre-save hook keeps manual values) and
 * re-derived from the updated variants for CONFIGURABLE ones.
 */

const Product = require("../models/Product");
const {
  FILTER_ATTRIBUTE_KEYS,
  normalizeFilterTokenByKey,
} = require("./filterAttributeRules");
const { toSlug } = require("./attributeValuePolicy");

/** Every string a product might hold for a source value. */
const matchTokensFor = (source) => {
  const tokens = new Set();
  const add = (raw) => {
    const token = String(raw ?? "").trim();
    if (token) tokens.add(token);
  };
  add(source.value);
  add(source.label);
  add(String(source.label ?? "").toLowerCase());
  add(toSlug(source.label));
  for (const synonym of source.synonyms || []) {
    add(synonym);
    add(toSlug(synonym));
  }
  return Array.from(tokens);
};

const tokenMatches = (current, tokens) => {
  const needle = String(current ?? "");
  if (!needle) return false;
  const lower = needle.toLowerCase();
  return tokens.some((t) => t === needle || t.toLowerCase() === lower);
};

/**
 * @param {object} attribute   the AttributeDefinition being edited
 * @param {object} target      the surviving canonical allowed value
 * @param {object[]} sources   the allowed values being merged away
 * @returns {Promise<{products:number, variants:number, options:number, skipped:number}>}
 */
const rewriteProductReferences = async (attribute, target, sources) => {
  const code = attribute.code;
  const isFilterKey = FILTER_ATTRIBUTE_KEYS.includes(code);
  const tokens = sources.flatMap(matchTokensFor);
  if (!tokens.length) return { products: 0, variants: 0, skipped: 0 };

  const products = await Product.find({
    $or: [
      { [`attributes.${code}`]: { $in: tokens } },
      { [`filterAttributes.${code}`]: { $in: tokens } },
      { [`variants.attributes.${code}`]: { $in: tokens } },
      { [`variants.options.${code}`]: { $in: tokens } },
      { "variantOptions.code": code },
      { "variantOptions.name": code },
    ],
  });

  let productsTouched = 0;
  let variantsTouched = 0;
  let optionsTouched = 0;
  let skipped = 0;

  for (const product of products) {
    let changed = false;

    if (product.attributes && typeof product.attributes.get === "function") {
      const current = product.attributes.get(code);
      if (tokenMatches(current, tokens)) {
        product.attributes.set(code, target.label);
        changed = true;
      }
    }

    // variantOptions[].values[].value — the shared variant-option vocabulary.
    // Rewriting it keeps the option picker, variant hashes and the derived
    // filterAttributes all aligned with the merged canonical value.
    for (const option of product.variantOptions || []) {
      const optionKey = String(option?.code || option?.name || "").toLowerCase().trim();
      if (optionKey !== String(code).toLowerCase()) continue;
      for (const valueItem of option?.values || []) {
        if (!valueItem || typeof valueItem !== "object") continue;
        if (tokenMatches(valueItem.value, tokens)) {
          valueItem.value = target.value;
          if (target.label) valueItem.label = target.label;
          optionsTouched += 1;
          changed = true;
        }
      }
    }

    for (const variant of product.variants || []) {
      const attrs = variant.attributes || variant.options;
      if (!attrs || typeof attrs.get !== "function") continue;
      const current = attrs.get(code);
      if (tokenMatches(current, tokens)) {
        attrs.set(code, target.value);
        variantsTouched += 1;
        changed = true;
      }
    }

    if (isFilterKey && product.filterAttributes) {
      const currentArr = product.filterAttributes[code];
      if (Array.isArray(currentArr) && currentArr.length) {
        const sourceCanonicals = new Set(
          sources
            .map((s) => normalizeFilterTokenByKey(code, s.value))
            .filter(Boolean),
        );
        const targetCanonical =
          normalizeFilterTokenByKey(code, target.value) ||
          normalizeFilterTokenByKey(code, target.label);
        let faChanged = false;
        const nextArr = currentArr.map((slug) => {
          if (sourceCanonicals.has(slug) && targetCanonical && slug !== targetCanonical) {
            faChanged = true;
            return targetCanonical;
          }
          return slug;
        });
        if (faChanged) {
          product.filterAttributes[code] = [...new Set(nextArr)];
          changed = true;
        }
      }
    }

    if (!changed) {
      skipped += 1;
      continue;
    }

    try {
      // variantOptions is a subdocument array and attributes/options are Maps;
      // mark them modified so Mongoose persists the in-place edits.
      product.markModified("variantOptions");
      product.markModified("attributes");
      product.markModified("variants");
      await product.save();
      productsTouched += 1;
    } catch (error) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.error(`Failed to rewrite references on product ${product._id}:`, error.message);
    }
  }

  return { products: productsTouched, variants: variantsTouched, options: optionsTouched, skipped };
};

module.exports = {
  rewriteProductReferences,
  matchTokensFor,
};
