const {
  FILTER_ATTRIBUTE_KEYS,
  FILTER_ATTRIBUTE_DEFINITIONS,
  normalizeFilterTokenByKey,
  expandCanonicalToAliases,
  allowsMultipleValues,
} = require("./filterAttributeRules");

const FILTER_ATTRIBUTE_KEY_SET = new Set(FILTER_ATTRIBUTE_KEYS);

const normalizeFilterValue = (value, key) => {
  return normalizeFilterTokenByKey(key, value);
};

const mapToObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);

  // Mongoose subdocuments (e.g. SingleNested) do not expose fields as own props.
  if (typeof value.toObject === "function") {
    return value.toObject({
      flattenMaps: true,
      virtuals: false,
      getters: false,
      depopulate: true,
    });
  }

  if (typeof value === "object") return value;
  return {};
};

const normalizeFilterArray = (input, key) => {
  const values = Array.isArray(input) ? input : [input];
  const set = new Set();

  values.forEach((value) => {
    const normalized = normalizeFilterValue(value, key);
    if (normalized) set.add(normalized);
  });

  return Array.from(set);
};

const normalizeFilterAttributes = (input = {}) => {
  const source = mapToObject(input);
  const normalized = {};

  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = normalizeFilterArray(source[key], key);
    }
  });

  return normalized;
};

const getAttributeValue = (attributes, key) => {
  const attrs = mapToObject(attributes);
  const target = String(key || "").toLowerCase();

  for (const [attrKey, attrValue] of Object.entries(attrs)) {
    if (String(attrKey || "").toLowerCase() === target) {
      return attrValue;
    }
  }

  return undefined;
};

const deriveColorAndSizeFromVariants = (variants) => {
  const colorSet = new Set();
  const sizeSet = new Set();

  (Array.isArray(variants) ? variants : []).forEach((variant) => {
    const variantAttributes = variant?.attributes || variant?.options || {};

    const rawColor = getAttributeValue(variantAttributes, "color");
    const normalizedColor = normalizeFilterValue(rawColor, "color");
    if (normalizedColor) colorSet.add(normalizedColor);

    const rawSize =
      getAttributeValue(variantAttributes, "size") ??
      getAttributeValue(variantAttributes, "age");
    const normalizedSize = normalizeFilterValue(rawSize, "size");
    if (normalizedSize) sizeSet.add(normalizedSize);
  });

  return {
    color: Array.from(colorSet),
    size: Array.from(sizeSet),
  };
};

/**
 * Derive filter attributes (any attribute code) from the variants' own
 * attribute maps — the variants are the source of truth for attributes that
 * are also used as variant options (color, size, material, etc.).
 */
const deriveAttributesFromVariants = (variants, keys) => {
  const result = {};
  (Array.isArray(keys) ? keys : []).forEach((key) => {
    const seen = new Set();
    (Array.isArray(variants) ? variants : []).forEach((variant) => {
      const variantAttributes = variant?.attributes || variant?.options || {};
      const raw = getAttributeValue(variantAttributes, key);
      const normalized = normalizeFilterValue(raw, key);
      if (normalized) seen.add(normalized);
    });
    result[key] = Array.from(seen);
  });
  return result;
};

const isConfigurableType = (type) => {
  return String(type || "").trim().toLowerCase() === "configurable";
};

const syncFilterAttributes = ({
  productType,
  filterAttributes,
  variants,
  variantOptions,
  fallbackFilterAttributes,
}) => {
  const base = {
    ...normalizeFilterAttributes(fallbackFilterAttributes || {}),
    ...normalizeFilterAttributes(filterAttributes || {}),
  };

  if (!isConfigurableType(productType)) {
    return base;
  }

  // For CONFIGURABLE products, any attribute that is used as a variant option
  // (color, size, material, etc.) is derived from the variants and overrides
  // whatever was provided manually — the Metadata section (which renders after
  // the Variants step) auto-syncs these so the admin doesn't re-enter
  // duplicates. Attributes NOT used as variant options (e.g. material when not
  // a dimension) keep their manual values.
  //
  // Codes come from (a) variantOptions.code / legacy .name, and (b) the keys
  // actually present in the variants' own attribute/options maps — the variants
  // are the source of truth for which dimensions are really in use.
  const optionCodes = new Set();
  (Array.isArray(variantOptions) ? variantOptions : []).forEach((o) => {
    const code = String(o?.code || o?.name || "").trim().toLowerCase();
    if (code) optionCodes.add(code);
  });
  (Array.isArray(variants) ? variants : []).forEach((variant) => {
    const attrs = mapToObject(variant?.attributes || variant?.options);
    Object.keys(attrs).forEach((key) => {
      const code = String(key).trim().toLowerCase();
      if (code) optionCodes.add(code);
    });
  });

  const result = { ...base };

  // Override every attribute that is a variant option with the derived values
  // (variants are the source of truth → empty derived clears stale manual data).
  // Only known filter keys are overridden — legacy alias keys (e.g. "age" for
  // size) never leak into the stored filterAttributes.
  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (!optionCodes.has(key)) return;
    const value = deriveAttributesFromVariants(variants, [key])[key] || [];
    result[key] = value;
  });

  // Historical compatibility: when no option codes could be identified at all
  // (name/attributeId-only legacy rows with no variant attribute maps), keep
  // the old behavior — always derive `size`, and derive `color` only when no
  // manual values are provided. This branch is unreachable for products that
  // carry real variants (their attribute maps dictate the codes), so it only
  // guards empty/edge-cased CONFIGURABLE records.
  if (optionCodes.size === 0) {
    const derived = deriveColorAndSizeFromVariants(variants);
    result.size = derived.size;
    if (!result.color || result.color.length === 0) {
      result.color = derived.color;
    }
  }

  // Deduplicate all filter attribute arrays
  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (Array.isArray(result[key])) {
      result[key] = [...new Set(result[key])];
    }
  });

  return result;
};

const buildFilterAttributesQuery = (filters = {}) => {
  const query = {};

  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(filters, key)) return;

    const canonicalValues = normalizeFilterArray(filters[key], key);
    if (canonicalValues.length === 0) return;

    // Expand each canonical to all its known aliases so that products stored
    // with any variant of the value (e.g. "0-3-month" vs "0-3-months") all match.
    const expandedValues = [
      ...new Set(canonicalValues.flatMap((v) => expandCanonicalToAliases(key, v))),
    ];

    query[`filterAttributes.${key}`] =
      expandedValues.length === 1 ? expandedValues[0] : { $in: expandedValues };
  });

  return query;
};

const sanitizeIncomingFilterAttributes = (
  input = {},
  { allowOnly = [] } = {}
) => {
  if (!input || typeof input !== "object") return {};
  const source = mapToObject(input);

  const allowed =
    Array.isArray(allowOnly) && allowOnly.length > 0
      ? new Set(allowOnly.filter((key) => FILTER_ATTRIBUTE_KEY_SET.has(key)))
      : FILTER_ATTRIBUTE_KEY_SET;

  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    sanitized[key] = normalizeFilterArray(value, key);
  }

  return sanitized;
};

const getFilterAttributeCardinalityViolations = (
  input = {},
  { allowOnly = [], productType } = {}
) => {
  if (!input || typeof input !== "object") return [];
  const source = mapToObject(input);

  const allowed =
    Array.isArray(allowOnly) && allowOnly.length > 0
      ? new Set(allowOnly.filter((key) => FILTER_ATTRIBUTE_KEY_SET.has(key)))
      : FILTER_ATTRIBUTE_KEY_SET;

  const violations = [];
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    const normalizedValues = normalizeFilterArray(value, key);
    if (
      normalizedValues.length > 1 &&
      !allowsMultipleValues(key, { productType })
    ) {
      violations.push({
        key,
        values: normalizedValues,
      });
    }
  }

  return violations;
};

module.exports = {
  FILTER_ATTRIBUTE_KEYS,
  FILTER_ATTRIBUTE_DEFINITIONS,
  normalizeFilterValue,
  normalizeFilterArray,
  normalizeFilterAttributes,
  syncFilterAttributes,
  deriveAttributesFromVariants,
  buildFilterAttributesQuery,
  sanitizeIncomingFilterAttributes,
  getFilterAttributeCardinalityViolations,
  allowsMultipleValues,
};
