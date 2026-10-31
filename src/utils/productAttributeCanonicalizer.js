/**
 * Product attribute catalogue canonicalization (Layer 2 — the structural
 * backstop).
 *
 * Given a product document, resolves every attribute value it carries
 * (variantOptions[].values[], variants[].attributes/options, filterAttributes)
 * against the AttributeDefinition catalogue and:
 *
 *   - rewrites it to the registered canonical `value` when a match is found
 *     (self-healing: "0-3" → "0-3-months", "Red " → "red", legacy aliases, …)
 *   - rewrites the display `label` to the catalogue label (so imported/
 *     legacy rows show nice labels, never raw slugs)
 *   - returns the list of unresolved values instead of guessing
 *
 * It NEVER invents a value: only values that exist in the catalogue are used.
 * The caller decides what to do with unresolved values (the model hook warns,
 * the guard/controller rejects them at the API boundary).
 *
 * Pure/deterministic — all matching is delegated to
 * resolveCatalogValueForAttribute so rules can never diverge from the guard.
 */

const { resolveCatalogValueForAttribute, loadAttributeCatalogMap } = require("./attributeCatalogGuard");

const RESERVED_VARIANT_KEYS = new Set(["sku", "price", "stock", "image", "images"]);

const normKey = (s) => String(s ?? "").toLowerCase().trim();

/**
 * Canonicalize a product document in place.
 *
 * @param {object} product        Mongoose product doc (or plain object)
 * @param {Map}    catalogMap     Map<lowercode, AttributeDefinition> from
 *                                loadAttributeCatalogMap()
 * @returns {{
 *   changed: boolean,
 *   rewrites: Array<{scope,key,from,to}>,
 *   unresolved: Array<{scope,key,value}>
 * }}
 */
function canonicalizeProductAttributeValues(product, catalogMap) {
  const rewrites = [];
  const unresolved = [];
  let changed = false;

  const resolve = (key, raw) => {
    const def = catalogMap.get(normKey(key));
    // No catalogue entry, or an attribute with an empty catalogue → leave
    // the value untouched; there is nothing to canonicalize against.
    if (!def || !Array.isArray(def.allowedValues) || def.allowedValues.length === 0) {
      return { untouched: true };
    }
    const resolved = resolveCatalogValueForAttribute(def, raw);
    if (resolved) return { resolved };
    return { unresolved: true };
  };

  // 1. variantOptions[].values[]
  for (const option of product.variantOptions || []) {
    const key = option?.code || option?.name;
    for (const valueItem of option?.values || []) {
      if (!valueItem || typeof valueItem !== "object") continue;
      const current = valueItem.value;
      const outcome = resolve(key, current);
      if (outcome.untouched) continue;
      if (outcome.unresolved) {
        unresolved.push({ scope: "variantOptions", key: normKey(key), value: current });
        continue;
      }
      const { value, label } = outcome.resolved;
      if (valueItem.value !== value || (label && valueItem.label !== label)) {
        rewrites.push({ scope: "variantOptions", key: normKey(key), from: valueItem.value, to: value });
        valueItem.value = value;
        if (label) valueItem.label = label;
        changed = true;
      }
    }
  }

  // 2. variants[].attributes / variants[].options
  for (const variant of product.variants || []) {
    for (const field of ["attributes", "options"]) {
      const attrs = variant?.[field];
      if (!attrs) continue;
      const isMap = attrs instanceof Map;
      const entries = isMap ? Array.from(attrs.entries()) : Object.entries(attrs);
      for (const [key, current] of entries) {
        if (RESERVED_VARIANT_KEYS.has(normKey(key))) continue;
        const outcome = resolve(key, current);
        if (outcome.untouched) continue;
        if (outcome.unresolved) {
          unresolved.push({ scope: "variants", key: normKey(key), value: current });
          continue;
        }
        const { value } = outcome.resolved;
        if (current !== value) {
          rewrites.push({ scope: "variants", key: normKey(key), from: current, to: value });
          if (isMap) attrs.set(key, value);
          else attrs[key] = value;
          changed = true;
        }
      }
    }
  }

  // 3. filterAttributes (SIMPLE products keep manual values; CONFIGURABLE
  //    ones are re-derived from variants by syncFilterAttributes afterwards,
  //    but canonicalizing here keeps them consistent either way).
  const fa = product.filterAttributes;
  if (fa) {
    const isMap = fa instanceof Map;
    const keys = isMap ? Array.from(fa.keys()) : Object.keys(fa);
    for (const key of keys) {
      const currentArr = isMap ? fa.get(key) : fa[key];
      const arr = Array.isArray(currentArr) ? currentArr : [currentArr];
      const next = [];
      let arrChanged = false;
      for (const current of arr) {
        const outcome = resolve(key, current);
        if (outcome.untouched) {
          next.push(current);
          continue;
        }
        if (outcome.unresolved) {
          unresolved.push({ scope: "filterAttributes", key: normKey(key), value: current });
          next.push(current); // leave as-is; guard rejects at the boundary
          continue;
        }
        const { value } = outcome.resolved;
        if (current !== value) {
          rewrites.push({ scope: "filterAttributes", key: normKey(key), from: current, to: value });
          arrChanged = true;
        }
        next.push(value);
      }
      if (arrChanged) {
        const deduped = [...new Set(next)];
        if (isMap) fa.set(key, deduped);
        else fa[key] = deduped;
        changed = true;
      }
    }
  }

  return { changed, rewrites, unresolved };
}

/**
 * Async convenience wrapper: loads the catalogue then canonicalizes.
 * @param {object} product
 * @returns {Promise<ReturnType<typeof canonicalizeProductAttributeValues>>}
 */
async function canonicalizeProductAttributeValuesAsync(product) {
  const catalogMap = await loadAttributeCatalogMap();
  return canonicalizeProductAttributeValues(product, catalogMap);
}

module.exports = {
  canonicalizeProductAttributeValues,
  canonicalizeProductAttributeValuesAsync,
};
