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

    // Check if this is a size field with matching pattern
    // Note: We only check for "size" - "age" is deprecated legacy field
    const sizePattern = /^\d+-\d+$/;
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

module.exports = {
  capitalizeWords,
  formatVariantOptionName,
  processVariantOptions,
};
