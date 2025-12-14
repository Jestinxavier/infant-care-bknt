/**
 * Variant Duplicate Detection & Validation Utilities
 */

const Product = require("../models/Product");

/**
 * Create hash from variant options for duplicate detection
 * @param {Map|Object} options - Variant options
 * @returns {String} - Hash string
 */
const createOptionsHash = (options) => {
  // Convert Map to Object if needed
  const optionsObj =
    options instanceof Map ? Object.fromEntries(options) : options || {};

  // Sort keys alphabetically and create consistent hash
  const sortedKeys = Object.keys(optionsObj).sort();
  const sorted = {};

  sortedKeys.forEach((key) => {
    sorted[key] = (optionsObj[key] || "").toString().toLowerCase().trim();
  });

  return JSON.stringify(sorted);
};

/**
 * Check if variant with same options exists
 * @param {String} productId - Product ID
 * @param {Map|Object} options - Variant options
 * @param {String} excludeVariantId - Variant ID to exclude (for updates)
 * @returns {Promise<Boolean>} - True if duplicate exists
 */
const isDuplicateVariant = async (
  productId,
  options,
  excludeVariantId = null
) => {
  const product = await Product.findById(productId);
  if (!product || !product.variants) return false;

  const optionsHash = createOptionsHash(options);

  // Check if any variant has matching hash
  const duplicate = product.variants.some((variant) => {
    // Skip if this is the variant we're updating
    if (excludeVariantId && variant.id === excludeVariantId) {
      return false;
    }

    // Check hash if available
    if (variant._optionsHash) {
      return variant._optionsHash === optionsHash;
    }

    // Fallback: create hash from variant options
    const variantHash = createOptionsHash(
      variant.options || variant.attributes
    );
    return variantHash === optionsHash;
  });

  return duplicate;
};

/**
 * Validate variant options against product's configurable options
 * @param {Product} product - Product document
 * @param {Map|Object} options - Variant options to validate
 * @returns {Object} - { valid: Boolean, errors: Array }
 */
const validateVariantOptions = (product, options) => {
  const errors = [];

  if (!product.variantOptions || product.variantOptions.length === 0) {
    return {
      valid: true,
      errors: [],
      warning: "No configurable options defined for product",
    };
  }

  // Convert Map to Object if needed
  const optionsObj =
    options instanceof Map ? Object.fromEntries(options) : options || {};

  // Check all required options are present
  product.variantOptions.forEach((configOption) => {
    const optionValue = optionsObj[configOption.name];

    if (!optionValue) {
      errors.push(
        `Missing required option: ${configOption.name} (${configOption.id})`
      );
      return;
    }

    // Check if value is in allowed values
    const normalizedValue = optionValue.toString().toLowerCase().trim();
    const allowedValues = configOption.values.map((v) =>
      (v.value || "").toString().toLowerCase().trim()
    );

    if (!allowedValues.includes(normalizedValue)) {
      errors.push(
        `Invalid value "${optionValue}" for ${configOption.name}. ` +
          `Allowed: ${allowedValues.join(", ")}`
      );
    }
  });

  // Check no extra options (warn only, not error)
  const configuredNames = product.variantOptions.map((opt) => opt.name);
  const extraOptions = Object.keys(optionsObj).filter(
    (key) => !configuredNames.includes(key)
  );

  if (extraOptions.length > 0) {
    errors.push(
      `Unknown options: ${extraOptions.join(", ")}. ` +
        `Configured options are: ${configuredNames.join(", ")}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate variant data before creation/update
 * @param {Object} variantData - Variant data
 * @param {Product} product - Product document
 * @returns {Object} - { valid: Boolean, errors: Array }
 */
const validateVariantData = (variantData, product) => {
  const errors = [];

  // Required fields
  if (!variantData.sku || !variantData.sku.trim()) {
    errors.push("SKU is required");
  }

  if (variantData.price === undefined || variantData.price === null) {
    errors.push("Price is required");
  } else if (typeof variantData.price !== "number" || variantData.price < 0) {
    errors.push("Price must be a non-negative number");
  }

  if (variantData.stock === undefined || variantData.stock === null) {
    errors.push("Stock is required");
  } else if (typeof variantData.stock !== "number" || variantData.stock < 0) {
    errors.push("Stock must be a non-negative number");
  }

  // Validate options
  const optionsValidation = validateVariantOptions(
    product,
    variantData.options || variantData.attributes || {}
  );

  if (!optionsValidation.valid) {
    errors.push(...optionsValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  createOptionsHash,
  isDuplicateVariant,
  validateVariantOptions,
  validateVariantData,
};
