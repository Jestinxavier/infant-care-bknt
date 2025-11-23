/**
 * Format label from value (e.g., "sky-blue" -> "Sky Blue")
 * Keeps the value unchanged, only formats the display label
 * 
 * @param {string} value - The filter value (e.g., "sky-blue", "red", "0-3")
 * @returns {string} Formatted label (e.g., "Sky Blue", "Red", "0 - 3")
 */
const formatLabel = (value) => {
  if (!value || typeof value !== "string") return value;

  // Handle size/age format (e.g., "0-3" -> "0 - 3")
  if (/^\d+-\d+/.test(value)) {
    return value.replace(/-/g, " - ");
  }

  // Handle hyphenated values (e.g., "sky-blue" -> "Sky Blue")
  return value
    .split("-")
    .map((word) => {
      // Capitalize first letter of each word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

module.exports = { formatLabel };

