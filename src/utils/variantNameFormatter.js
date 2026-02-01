/**
 * Capitalizes the first letter of each word in a string
 * @param {string} str - The string to capitalize
 * @returns {string} - The capitalized string
 */
const capitalizeWords = (str) => {
  if (!str || typeof str !== "string") return str;
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Capitalizes the first letter of each word in a string
 * @param {string} name - The variant option name (e.g., "size", "age")
 * @returns {string} - The formatted name (e.g., "Size", "Age")
 */
const formatVariantOptionName = (name) => {
  if (!name || typeof name !== "string") return name;

  // Just capitalize the name, no "M" suffix for the option name itself
  return capitalizeWords(name);
};

/**
 * Processes variant options array, capitalizing names and adding "M" suffix for size patterns
 * Also processes value labels to append "M" for matching patterns
 * @param {Array} variantOptions - Array of variant option objects
 * @returns {Array} - Processed variant options with formatted names and labels
 */
const processVariantOptions = (variantOptions) => {
  if (!variantOptions || !Array.isArray(variantOptions)) return variantOptions;

  return variantOptions.map((option) => {
    // Add null check for option
    if (!option || typeof option !== "object") return option;

    // Get a sample value to detect if this is a size field
    const sampleValue =
      option.values && Array.isArray(option.values) && option.values.length > 0
        ? option.values[0]?.value
        : "";

    // Check if this is a size field with matching pattern (number hyphen number = months)
    // Allow optional spaces around hyphen, e.g. "0-3", "0 - 3"
    const sizePattern = /^\d+\s*-\s*\d+$/;
    const isSizeField =
      option.code?.toLowerCase()?.trim() === "size" ||
      option.name?.toLowerCase()?.trim() === "size";
    const matchesSizePattern =
      sampleValue && sizePattern.test(sampleValue.toString().trim());

    // Process values - add "M" to labels if it's a size field with matching pattern
    let processedValues = option.values;
    if (isSizeField && matchesSizePattern && Array.isArray(option.values)) {
      processedValues = option.values.map((valueItem) => {
        if (!valueItem || typeof valueItem !== "object") return valueItem;

        // Check if this specific value matches the pattern
        const itemMatchesPattern =
          valueItem.value &&
          sizePattern.test(valueItem.value.toString().trim());

        if (itemMatchesPattern) {
          return {
            ...valueItem,
            label: valueItem.label ? `${valueItem.label} M` : valueItem.label,
          };
        }

        return valueItem;
      });
    }

    return {
      ...option,
      name: formatVariantOptionName(option.name),
      values: processedValues,
    };
  });
};

/**
 * Normalizes variant attributes to store option values instead of labels.
 * Given variantOptions and an attributes object (e.g. { color: "Red", size: "0-3" }),
 * returns a Map with values from variantOptions (e.g. { color: "red", size: "0-3" }).
 * Matching is case-insensitive: if the attribute value equals an option value's label or value, the stored value is the option's .value.
 * @param {Array} variantOptions - Product variantOptions (with code/name and values[].value, values[].label)
 * @param {Object|Map} attributes - Variant attributes (labels or values)
 * @returns {Map} - Map of attribute code -> canonical value (option value, not label)
 */
const normalizeVariantAttributesToValues = (variantOptions, attributes) => {
  const result = new Map();
  if (!attributes) return result;
  const entries =
    attributes instanceof Map
      ? Array.from(attributes.entries())
      : Object.entries(attributes);
  const norm = (s) => (s ?? "").toString().trim().toLowerCase();

  for (const [key, val] of entries) {
    const option =
      Array.isArray(variantOptions) &&
      variantOptions.find(
        (o) =>
          (o.code && norm(o.code) === norm(key)) ||
          (o.name && norm(o.name) === norm(key))
      );
    if (!option || !Array.isArray(option.values)) {
      result.set(key, val != null ? String(val).trim() : "");
      continue;
    }
    const found = option.values.find(
      (v) => norm(v.value) === norm(val) || norm(v.label) === norm(val)
    );
    result.set(
      key,
      found ? found.value : val != null ? String(val).trim() : ""
    );
  }
  return result;
};

module.exports = {
  capitalizeWords,
  formatVariantOptionName,
  processVariantOptions,
  normalizeVariantAttributesToValues,
};
