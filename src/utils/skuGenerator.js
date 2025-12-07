/**
 * SKU Generation Utilities
 * Handles product and variant SKU generation with uniqueness checks
 */

/**
 * Generate a base SKU from product name
 * @param {string} productName - The product name
 * @param {Object} options - Generation options
 * @param {number} options.maxLength - Maximum SKU length (default: 20)
 * @param {string} options.prefix - Optional prefix
 * @param {string} options.suffix - Optional suffix
 * @returns {string} - Generated base SKU
 */
const generateBaseSku = (productName, options = {}) => {
  if (!productName || typeof productName !== 'string') {
    throw new Error('Product name is required to generate SKU');
  }

  const { maxLength = 20, prefix = '', suffix = '' } = options;

  // Clean and transform the product name
  let baseSku = productName
    .toString()
    .toUpperCase()
    .trim()
    // Remove common words that don't add value
    .replace(/\b(THE|AND|OR|FOR|WITH|IN|ON|AT|TO|A|AN)\b/g, '')
    // Replace spaces and special chars with hyphens
    .replace(/[\s\-_]+/g, '-')
    // Remove all non-alphanumeric chars except hyphens
    .replace(/[^A-Z0-9\-]/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/\-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');

  // If the result is too long, take first words and abbreviate
  if (baseSku.length > maxLength - prefix.length - suffix.length) {
    const words = baseSku.split('-');
    let abbreviated = '';

    for (let i = 0; i < words.length && abbreviated.length < maxLength - prefix.length - suffix.length - 3; i++) {
      if (i === 0) {
        // First word: take up to 8 characters
        abbreviated += words[i].substring(0, 8);
      } else if (words[i].length >= 3) {
        // Other words: take first 3 characters if word is 3+ chars
        abbreviated += '-' + words[i].substring(0, 3);
      }
    }
    baseSku = abbreviated;
  }

  return prefix + baseSku + suffix;
};

/**
 * Generate SKU suggestion for a product
 * @param {string} productName - The product name
 * @param {Object} options - Generation options
 * @returns {string} - Suggested SKU
 */
const suggestProductSku = (productName, options = {}) => {
  return generateBaseSku(productName, {
    maxLength: 15,
    prefix: options.prefix || 'P-',
    suffix: options.suffix || '',
    ...options
  });
};

/**
 * Generate variant SKU from base product SKU and variant options
 * @param {string} baseSku - Base product SKU
 * @param {Object} variantOptions - Variant option values (e.g., { color: 'red', size: 'M' })
 * @param {Object} config - Configuration options
 * @param {string} config.separator - Separator between SKU parts (default: '-')
 * @param {number} config.maxLength - Maximum total SKU length (default: 30)
 * @returns {string} - Generated variant SKU
 */
const generateVariantSku = (baseSku, variantOptions = {}, config = {}) => {
  if (!baseSku || typeof baseSku !== 'string') {
    throw new Error('Base SKU is required to generate variant SKU');
  }

  const { separator = '-', maxLength = 30 } = config;
  let variantSku = baseSku;

  // Predefined abbreviations for common variant values
  const abbreviations = {
    // Colors
    red: 'RED', blue: 'BLU', green: 'GRN', yellow: 'YEL', orange: 'ORG',
    purple: 'PUR', pink: 'PNK', black: 'BLK', white: 'WHT', gray: 'GRY',
    brown: 'BRN', navy: 'NVY', maroon: 'MAR', beige: 'BGE', cream: 'CRM',

    // Sizes
    'extra-small': 'XS', 'x-small': 'XS', 'xsmall': 'XS',
    small: 'S', medium: 'M', large: 'L',
    'extra-large': 'XL', 'x-large': 'XL', 'xlarge': 'XL',
    'xx-large': 'XXL', 'xxl': 'XXL', '2xl': 'XXL',
    'xxx-large': 'XXXL', 'xxxl': 'XXXL', '3xl': 'XXXL',

    // Ages/Months
    '0-3': '03M', '3-6': '36M', '6-9': '69M', '9-12': '912M',
    '12-18': '1218M', '18-24': '1824M', '0-3-months': '03M',
    '3-6-months': '36M', '6-9-months': '69M', '9-12-months': '912M',

    // Materials
    cotton: 'COT', organic: 'ORG', wool: 'WOL', linen: 'LIN',
    polyester: 'POL', silk: 'SLK', denim: 'DEN', leather: 'LTH'
  };

  // Process variant options in a consistent order
  const orderedKeys = ['color', 'size', 'age', 'material', 'style'].filter(key =>
    variantOptions[key]
  );

  // Add any remaining keys not in the ordered list
  const remainingKeys = Object.keys(variantOptions).filter(key =>
    !orderedKeys.includes(key) && variantOptions[key]
  );

  const allKeys = [...orderedKeys, ...remainingKeys];

  for (const key of allKeys) {
    const value = variantOptions[key];
    if (!value) continue;

    const normalizedValue = value.toString().toLowerCase().trim();
    const abbreviation = abbreviations[normalizedValue] ||
                        normalizedValue.toUpperCase().substring(0, 3);

    const newPart = separator + abbreviation;

    // Check if adding this part would exceed maxLength
    if (variantSku.length + newPart.length <= maxLength) {
      variantSku += newPart;
    } else {
      // If we're running out of space, use shorter abbreviations
      const shortAbbr = abbreviation.substring(0, 2);
      const shortPart = separator + shortAbbr;

      if (variantSku.length + shortPart.length <= maxLength) {
        variantSku += shortPart;
      }
      break; // Stop adding more parts if we're at the limit
    }
  }

  return variantSku;
};

/**
 * Generate unique SKU by appending counter if needed
 * @param {string} baseSku - Base SKU to make unique
 * @param {Function} checkExists - Async function to check if SKU exists: (sku) => Promise<boolean>
 * @param {string} excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @returns {Promise<string>} - Unique SKU
 */
const generateUniqueSku = async (baseSku, checkExists, excludeId = null) => {
  if (!baseSku || typeof baseSku !== 'string') {
    throw new Error('Base SKU is required to generate unique SKU');
  }

  if (typeof checkExists !== 'function') {
    throw new Error('checkExists function is required');
  }

  let uniqueSku = baseSku;
  let counter = 1;

  // Check if base SKU exists
  const exists = await checkExists(uniqueSku, excludeId);

  if (!exists) {
    return uniqueSku;
  }

  // If exists, append counter until unique
  while (counter <= 999) {
    uniqueSku = `${baseSku}-${counter.toString().padStart(2, '0')}`;
    const keyExists = await checkExists(uniqueSku, excludeId);

    if (!keyExists) {
      return uniqueSku;
    }

    counter++;
  }

  // If we've tried 999 variations, throw an error
  throw new Error(`Unable to generate unique SKU after 999 attempts for base: ${baseSku}`);
};

/**
 * Validate SKU format
 * @param {string} sku - SKU to validate
 * @param {Object} rules - Validation rules
 * @returns {Object} - Validation result { valid: boolean, error?: string }
 */
const validateSku = (sku, rules = {}) => {
  const {
    minLength = 2,
    maxLength = 30,
    allowedChars = /^[A-Z0-9\-_]+$/,
    required = true
  } = rules;

  if (!sku) {
    return {
      valid: !required,
      error: required ? 'SKU is required' : null
    };
  }

  if (typeof sku !== 'string') {
    return { valid: false, error: 'SKU must be a string' };
  }

  const trimmedSku = sku.trim();

  if (trimmedSku.length < minLength) {
    return { valid: false, error: `SKU must be at least ${minLength} characters long` };
  }

  if (trimmedSku.length > maxLength) {
    return { valid: false, error: `SKU cannot exceed ${maxLength} characters` };
  }

  if (!allowedChars.test(trimmedSku)) {
    return { valid: false, error: 'SKU contains invalid characters. Only A-Z, 0-9, hyphens and underscores are allowed' };
  }

  return { valid: true };
};

module.exports = {
  generateBaseSku,
  suggestProductSku,
  generateVariantSku,
  generateUniqueSku,
  validateSku
};
