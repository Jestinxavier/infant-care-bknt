/**
 * Generate a URL-friendly slug from a string
 * @param {string} text - The text to convert to slug
 * @returns {string} - The generated slug
 */
const generateSlug = (text) => {
  if (!text) return "";

  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars except hyphens
    .replace(/\-\-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+/, "") // Trim hyphens from start
    .replace(/-+$/, ""); // Trim hyphens from end
};

/**
 * Generate a unique url_key for a product
 * @param {string} title - Product title
 * @param {Function} checkExists - Async function to check if url_key exists: (url_key, excludeId?) => Promise<boolean>
 * @param {string} excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @returns {Promise<string>} - Unique url_key
 */
const generateUniqueUrlKey = async (title, checkExists, excludeId = null) => {
  if (!title) {
    throw new Error("Title is required to generate url_key");
  }

  if (typeof checkExists !== "function") {
    throw new Error("checkExists function is required");
  }

  let baseSlug = generateSlug(title);
  let urlKey = baseSlug;
  let counter = 2;

  // Check if base slug exists
  const exists = await checkExists(urlKey, excludeId);

  if (!exists) {
    return urlKey;
  }

  // If exists, append counter until unique
  while (counter <= 999) {
    urlKey = `${baseSlug}-${counter}`;
    const keyExists = await checkExists(urlKey, excludeId);

    if (!keyExists) {
      return urlKey;
    }

    counter++;
  }

  // If we've tried 999 variations, throw an error
  throw new Error(
    `Unable to generate unique url_key after 999 attempts for title: ${title}`,
  );
};

/**
 * Generate URL key with redirect handling
 * @param {string} title - Product title
 * @param {Function} checkExists - Async function to check if url_key exists
 * @param {string} currentUrlKey - Current URL key (for updates)
 * @param {string} excludeId - Optional ID to exclude from uniqueness check
 * @returns {Promise<Object>} - { urlKey: string, shouldCreateRedirect: boolean, previousUrlKey?: string }
 */
const generateUrlKeyWithRedirect = async (
  title,
  checkExists,
  currentUrlKey = null,
  excludeId = null,
) => {
  if (!title) {
    throw new Error("Title is required to generate url_key");
  }

  const newSlug = generateSlug(title);

  // If updating and slug would be the same, keep current URL key
  if (currentUrlKey) {
    const currentBase = currentUrlKey.includes("-")
      ? currentUrlKey.split("-").slice(0, -1).join("-")
      : currentUrlKey;

    if (newSlug === currentBase || newSlug === currentUrlKey) {
      return {
        urlKey: currentUrlKey,
        shouldCreateRedirect: false,
      };
    }
  }

  // Generate unique URL key
  const urlKey = await generateUniqueUrlKey(title, checkExists, excludeId);

  return {
    urlKey,
    shouldCreateRedirect: !!currentUrlKey && currentUrlKey !== urlKey,
    previousUrlKey: currentUrlKey,
  };
};

/**
 * Validate URL key format
 * @param {string} urlKey - URL key to validate
 * @returns {Object} - Validation result { valid: boolean, error?: string }
 */
const validateUrlKey = (urlKey) => {
  if (!urlKey) {
    return { valid: false, error: "URL key is required" };
  }

  if (typeof urlKey !== "string") {
    return { valid: false, error: "URL key must be a string" };
  }

  const trimmedKey = urlKey.trim();

  if (trimmedKey.length < 2) {
    return {
      valid: false,
      error: "URL key must be at least 2 characters long",
    };
  }

  if (trimmedKey.length > 100) {
    return { valid: false, error: "URL key cannot exceed 100 characters" };
  }

  // URL key should be a valid slug
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugPattern.test(trimmedKey)) {
    return {
      valid: false,
      error:
        "URL key must be lowercase letters, numbers, and hyphens only (no spaces or special characters)",
    };
  }

  // Should not start or end with hyphen
  if (trimmedKey.startsWith("-") || trimmedKey.endsWith("-")) {
    return {
      valid: false,
      error: "URL key cannot start or end with a hyphen",
    };
  }

  return { valid: true };
};

module.exports = {
  generateSlug,
  generateUniqueUrlKey,
  generateUrlKeyWithRedirect,
  validateUrlKey,
};
