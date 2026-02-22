const {
  FILTER_ATTRIBUTE_KEYS,
  FILTER_ATTRIBUTE_DEFINITIONS,
  normalizeFilterTokenByKey,
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

const isConfigurableType = (type) => {
  return String(type || "").trim().toLowerCase() === "configurable";
};

const syncFilterAttributes = ({
  productType,
  filterAttributes,
  variants,
  fallbackFilterAttributes,
}) => {
  const base = {
    ...normalizeFilterAttributes(fallbackFilterAttributes || {}),
    ...normalizeFilterAttributes(filterAttributes || {}),
  };

  if (!isConfigurableType(productType)) {
    return base;
  }

  const derived = deriveColorAndSizeFromVariants(variants);
  return {
    ...base,
    color: derived.color,
    size: derived.size,
  };
};

const buildFilterAttributesQuery = (filters = {}) => {
  const query = {};

  FILTER_ATTRIBUTE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(filters, key)) return;

    const values = normalizeFilterArray(filters[key], key);
    if (values.length === 0) return;

    query[`filterAttributes.${key}`] =
      values.length === 1 ? values[0] : { $in: values };
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
  buildFilterAttributesQuery,
  sanitizeIncomingFilterAttributes,
  getFilterAttributeCardinalityViolations,
  allowsMultipleValues,
};
