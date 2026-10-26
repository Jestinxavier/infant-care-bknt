/**
 * Attribute catalogue guard — enforces that product metadata
 * (filterAttributes) and variant option values are registered on the
 * matching AttributeDefinition's allowedValues (Settings → Product
 * Attribute
 *
 * Rules:
 *   - AttributeDefinition is the single source of truth. A value passes
 *     when it matches a registered, active allowed value by `value`,
 *     `label`, or any registered `synonym` (case/whitespace insensitive),
 *     with the fuzzy catalog resolver as a final fallback (age ranges,
 *     dimensions, plurals).
 *   - An attribute that exists with an EMPTY allowedValues list is "not
 *     ready": any value supplied for it is rejected with an actionable
 *     message (seed the catalogue first). This closes the CSV/API bypass
 *     where an uncatalogued attribute let raw strings through.
 *   - An attribute key with no AttributeDefinition at all is skipped
 *     (legacy tolerance — only the nine whitelisted filter keys can even
 *     arrive here).
 *   - Legacy-safe on update: callers pass the values already stored on
 *     the product (`existing`); those are allowed through so editing an
 *     old product never bricks, while NEW unregistered values are still
 *     refused.
 *
 * The guard VALIDATES only — it never rewrites stored tokens, so
 * existing filter-alias behaviour is untouched.
 */

const AttributeDefinition = require("../models/AttributeDefinition");
const { resolveCatalogValue } = require("./catalogAttributeResolver");

// Registry identity: lowercase, collapse whitespace, spaces → hyphen.
// Mirrors the AttributeDefinition pre-save normalization.
const registryToken = (s) =>
  String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

/**
 * THE single catalogue resolver. Every layer (guard, model hook, merge
 * rewrite, reconciliation migration) must call this — never re-implement the
 * matching rules, so validation and canonicalization can never diverge.
 *
 * @param {object} attributeDef  AttributeDefinition (lean or doc)
 * @param {*}      rawValue      any string a product might store
 * @returns {object|null} { value, label, hex } for the matched allowed value,
 *                        or null when the value is not in the catalogue.
 */
function resolveCatalogValueForAttribute(attributeDef, rawValue) {
  const matched = findRegisteredAllowedValue(attributeDef, rawValue);
  if (!matched) return null;
  const value = String(matched.value).trim();
  return {
    value,
    label: matched.label ? String(matched.label).trim() : value,
    hex: matched.hex || null,
  };
}

/**
 * Find the active registered allowed value that `rawValue` refers to, or null.
 * Matches the canonical value, its display label, or any registered synonym,
 * then falls back to the fuzzy catalog resolver.
 */
function findRegisteredAllowedValue(attributeDef, rawValue) {
  const input = registryToken(rawValue);
  if (!input || !attributeDef) return null;

  const allowedValues = Array.isArray(attributeDef.allowedValues)
    ? attributeDef.allowedValues
    : [];

  const direct = allowedValues.find((av) => {
    if (!av || av.isActive === false) return false;
    if (registryToken(av.value) === input) return true;
    if (registryToken(av.label) === input) return true;
    return (
      Array.isArray(av.synonyms) &&
      av.synonyms.some((synonym) => registryToken(synonym) === input)
    );
  });
  if (direct) return direct;

  if (typeof resolveCatalogValue === "function") {
    const resolved = resolveCatalogValue(
      rawValue,
      allowedValues,
      attributeDef.code || attributeDef.name
    );
    if (resolved) return resolved;
  }

  return null;
}

// Human-readable list of the registered values a request may use.
function formatRegisteredValues(attributeDef) {
  const labels = (
    Array.isArray(attributeDef?.allowedValues) ? attributeDef.allowedValues : []
  )
    .filter((av) => av && av.isActive !== false)
    .map((av) => `"${av.label || av.value}"`);
  return labels.length ? labels.join(", ") : "(none configured)";
}

// Clear, actionable message for a value that is not in the catalogue.
function notRegisteredMessage(rawValue, attrKey, attributeDef) {
  const attrLabel = attributeDef?.label || attributeDef?.name || attrKey;
  return (
    `"${rawValue}" is not an approved value for '${attrKey}'. ` +
    `Change it to one of the registered values: ${formatRegisteredValues(
      attributeDef,
    )}, or add it to "${attrLabel}" in Settings → Product Attributes first.`
  );
}

function emptyCatalogMessage(attrKey, attributeDef) {
  const attrLabel = attributeDef?.label || attributeDef?.name || attrKey;
  return (
    `'${attrKey}' has no approved values yet. ` +
    `Add values to "${attrLabel}" in Settings → Product Attributes, then try again.`
  );
}

// Load every AttributeDefinition into a lookup map keyed by lowercase
// code and name (mirrors the bulk-import lookup).
async function loadAttributeCatalogMap() {
  const all = await AttributeDefinition.find({}).lean();
  const map = new Map();
  for (const attr of all) {
    if (attr.code) map.set(attr.code.toLowerCase(), attr);
    if (attr.name) map.set(attr.name.toLowerCase(), attr);
  }
  return map;
}

const isReservedVariantKey = (key) =>
  ["sku", "price", "stock", "image", "images"].includes(key);

const toEntries = (mapOrObj) => {
  if (!mapOrObj) return [];
  if (mapOrObj instanceof Map) return Array.from(mapOrObj.entries());
  if (typeof mapOrObj === "object") return Object.entries(mapOrObj);
  return [];
};

/**
 * Validate one raw value for one attribute key against the catalogue.
 * Returns a violation object, or null when the value is acceptable.
 */
function checkCatalogValue({ attributeDef, key, value, existing }) {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return null; // empty entries are dropped by sanitizers upstream

  if (!attributeDef) return null; // no definition → legacy tolerance

  const hasCatalog =
    Array.isArray(attributeDef.allowedValues) &&
    attributeDef.allowedValues.length > 0;
  if (!hasCatalog) {
    return { key, value: raw, message: emptyCatalogMessage(key, attributeDef) };
  }

  // Legacy-safe: values already stored on this product pass through.
  if (existing && existing.has(registryToken(raw))) return null;

  if (findRegisteredAllowedValue(attributeDef, raw)) return null;

  return { key, value: raw, message: notRegisteredMessage(raw, key, attributeDef) };
}

/**
 * Guard product metadata (filterAttributes), variant option definitions
 * (variantOptions[].values[]), and/or variant option values (variants[].attributes)
 * against the attribute catalogue.
 *
 * @param {Object}  params
 * @param {Object}  [params.filterAttributes] Sanitized filterAttributes map.
 * @param {Array}   [params.variantOptions]   Parsed variantOptions array.
 * @param {Array}   [params.variants]         Parsed variants array (each with
 *                                            attributes/options).
 * @param {Map}     [params.catalogMap]       Preloaded map from
 *                                            loadAttributeCatalogMap(); loaded
 *                                            internally when omitted.
 * @param {Object}  [params.existing]         { filterAttributes: Map<code,Set>,
 *                                              variantOptions: Map<code,Set>,
 *                                              variants: Map<code,Set> } of
 *                                            values already on the product
 *                                            (update flows).
 * @returns {Promise<Array>} violations —
 *   [{ scope, key, value, variantIndex?|optionIndex?, message }]
 */
async function guardProductAttributeCatalog({
  filterAttributes,
  variantOptions,
  variants,
  catalogMap,
  existing,
}) {
  const hasFilter = filterAttributes && typeof filterAttributes === "object";
  const hasOptions = Array.isArray(variantOptions) && variantOptions.length > 0;
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  if (!hasFilter && !hasOptions && !hasVariants) return [];

  const map = catalogMap || (await loadAttributeCatalogMap());
  const existingFilter = existing?.filterAttributes;
  const existingOptions = existing?.variantOptions;
  const existingVariants = existing?.variants;
  const violations = [];

  if (hasFilter) {
    for (const [key, value] of Object.entries(filterAttributes)) {
      const code = String(key || "").toLowerCase().trim();
      const values = Array.isArray(value) ? value : [value];
      for (const raw of values) {
        const violation = checkCatalogValue({
          attributeDef: map.get(code),
          key: code,
          value: raw,
          existing: existingFilter,
        });
        if (violation) violations.push({ scope: "filterAttributes", ...violation });
      }
    }
  }

  // variantOptions[].values[].value — the variant-option vocabulary. Its
  // attribute key is the option's `code` (fallback `name`).
  if (hasOptions) {
    variantOptions.forEach((option, optionIndex) => {
      const code = String(option?.code || option?.name || "")
        .toLowerCase()
        .trim();
      if (!code) return;
      for (const valueItem of option?.values || []) {
        const raw = valueItem?.value ?? valueItem?.label ?? valueItem;
        const violation = checkCatalogValue({
          attributeDef: map.get(code),
          key: code,
          value: raw,
          existing: existingOptions,
        });
        if (violation) {
          violations.push({ scope: "variantOptions", optionIndex, ...violation });
        }
      }
    });
  }

  if (hasVariants) {
    variants.forEach((variant, variantIndex) => {
      const attrs = variant?.attributes || variant?.options || {};
      for (const [key, value] of toEntries(attrs)) {
        const code = String(key || "").toLowerCase().trim();
        if (!code || isReservedVariantKey(code)) continue;
        const violation = checkCatalogValue({
          attributeDef: map.get(code),
          key: code,
          value,
          existing: existingVariants,
        });
        if (violation) {
          violations.push({ scope: "variants", variantIndex, ...violation });
        }
      }
    });
  }

  return violations;
}

/**
 * Collect the attribute values already stored on a product document, per
 * attribute code — the legacy allowance set for update flows.
 */
function collectExistingCatalogValues(product) {
  const filterAttributes = new Set();
  const variantOptions = new Set();
  const variants = new Set();

  const fa = product?.filterAttributes;
  const faObj =
    fa instanceof Map ? Object.fromEntries(fa) : fa && typeof fa === "object" ? fa : {};
  for (const value of Object.values(faObj)) {
    const values = Array.isArray(value) ? value : [value];
    for (const raw of values) {
      const token = registryToken(raw);
      if (token) filterAttributes.add(token);
    }
  }

  for (const option of product?.variantOptions || []) {
    for (const valueItem of option?.values || []) {
      const raw = valueItem?.value ?? valueItem?.label ?? valueItem;
      const token = registryToken(raw);
      if (token) variantOptions.add(token);
    }
  }

  for (const variant of product?.variants || []) {
    const attrs = variant?.attributes || variant?.options || {};
    for (const [, value] of toEntries(attrs)) {
      const token = registryToken(value);
      if (token) variants.add(token);
    }
  }

  return { filterAttributes, variantOptions, variants };
}

// Shared 400 response body for catalogue violations.
function catalogViolationResponse(violations) {
  return {
    success: false,
    errorCode: "ATTRIBUTE_VALUE_NOT_REGISTERED",
    message:
      "Some attribute values are not in the approved attribute catalogue.",
    violations,
  };
}

module.exports = {
  registryToken,
  findRegisteredAllowedValue,
  resolveCatalogValueForAttribute,
  formatRegisteredValues,
  notRegisteredMessage,
  loadAttributeCatalogMap,
  guardProductAttributeCatalog,
  collectExistingCatalogValues,
  catalogViolationResponse,
};
