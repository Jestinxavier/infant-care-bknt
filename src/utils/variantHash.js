/**
 * Variant hash generation utility
 * Creates deterministic hashes for variant option combinations
 * Used to prevent duplicate variants per product
 */

/**
 * Generate a deterministic hash from variant attributes
 * @param {Object|Map} attributes - Variant attributes (e.g., { color: "red", size: "m" })
 * @returns {string} - Sorted, joined hash string (e.g., "color:red|size:m")
 */
function generateOptionsHash(attributes) {
  if (!attributes) return "";

  // Convert Map to Object if needed
  const attrsObj =
    attributes instanceof Map ? Object.fromEntries(attributes) : attributes;

  // Sort keys alphabetically for deterministic output
  return Object.keys(attrsObj)
    .sort()
    .map((key) => `${key}:${attrsObj[key]}`)
    .join("|");
}

/**
 * Validate that a variant's options hash is unique within a product
 * @param {Array} variants - Array of variant objects
 * @param {string} newHash - The hash to check for uniqueness
 * @param {string} excludeVariantId - Optional variant ID to exclude (for updates)
 * @returns {boolean} - True if hash is unique
 */
function isHashUnique(variants, newHash, excludeVariantId = null) {
  if (!Array.isArray(variants) || !newHash) return true;

  return !variants.some(
    (v) => v._optionsHash === newHash && v.id !== excludeVariantId,
  );
}

/**
 * Find duplicate hashes in an array of variants
 * @param {Array} variants - Array of variant objects with _optionsHash
 * @returns {Array} - Array of duplicate hashes found
 */
function findDuplicateHashes(variants) {
  if (!Array.isArray(variants)) return [];

  const seen = new Set();
  const duplicates = new Set();

  for (const variant of variants) {
    if (variant._optionsHash) {
      if (seen.has(variant._optionsHash)) {
        duplicates.add(variant._optionsHash);
      }
      seen.add(variant._optionsHash);
    }
  }

  return Array.from(duplicates);
}

module.exports = {
  generateOptionsHash,
  isHashUnique,
  findDuplicateHashes,
};
