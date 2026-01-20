/**
 * Centralized value normalization utility
 * NEVER trust frontend normalization - always normalize on the server
 */

/**
 * Normalize a string value for storage
 * @param {string} value - The value to normalize
 * @returns {string} - Normalized value (lowercase, trimmed)
 */
function normalizeValue(value) {
  if (typeof value !== "string") return value;
  return value.trim().toLowerCase();
}

/**
 * Normalize an attribute code
 * @param {string} code - The code to normalize
 * @returns {string} - Normalized code (lowercase, trimmed, spaces to underscores)
 */
function normalizeCode(code) {
  if (typeof code !== "string") return code;
  return code.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Convert string to title case
 * @param {string} str - The string to convert
 * @returns {string} - Title cased string
 */
function toTitleCase(str) {
  if (typeof str !== "string") return str;
  return str
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Normalize variant option values array
 * @param {Array} values - Array of variant option values
 * @returns {Array} - Normalized values array
 */
function normalizeVariantValues(values) {
  if (!Array.isArray(values)) return values;

  return values.map((val) => ({
    ...val,
    value: normalizeValue(val.value || ""),
    label: val.label?.trim() || toTitleCase(val.value || ""),
  }));
}

module.exports = {
  normalizeValue,
  normalizeCode,
  toTitleCase,
  normalizeVariantValues,
};
