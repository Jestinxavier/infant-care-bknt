/**
 * Generate a URL-friendly slug from a string
 * @param {string} text - The text to convert to slug
 * @returns {string} - The generated slug
 */
const generateSlug = (text) => {
  if (!text) return '';
  
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars except hyphens
    .replace(/\-\-+/g, '-')         // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '')             // Trim hyphens from start
    .replace(/-+$/, '');             // Trim hyphens from end
};

/**
 * Generate a unique url_key for a product
 * @param {string} title - Product title
 * @param {Function} checkExists - Async function to check if url_key exists: (url_key) => Promise<boolean>
 * @param {string} existingUrlKey - Existing url_key if updating (optional)
 * @returns {Promise<string>} - Unique url_key
 */
const generateUniqueUrlKey = async (title, checkExists, existingUrlKey = null) => {
  if (!title) {
    throw new Error('Title is required to generate url_key');
  }

  let baseSlug = generateSlug(title);
  
  // If updating and title hasn't changed, return existing url_key
  if (existingUrlKey && baseSlug === existingUrlKey.split('-').slice(0, -1).join('-')) {
    return existingUrlKey;
  }

  let urlKey = baseSlug;
  let counter = 1;

  // Check if base slug exists
  const exists = await checkExists(urlKey);
  
  if (!exists) {
    return urlKey;
  }

  // If exists, append counter until unique
  while (true) {
    urlKey = `${baseSlug}-${counter}`;
    const keyExists = await checkExists(urlKey);
    
    if (!keyExists) {
      return urlKey;
    }
    
    counter++;
    
    // Safety limit
    if (counter > 1000) {
      throw new Error('Unable to generate unique url_key after 1000 attempts');
    }
  }
};

module.exports = {
  generateSlug,
  generateUniqueUrlKey
};

