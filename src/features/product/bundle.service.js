/**
 * Bundle Service
 *
 * Handles bundle-specific business logic:
 * - Stock availability resolution
 * - Bundle validation
 */

const Product = require("./product.model");
const { PRODUCT_TYPES } = Product;

/**
 * Get bundle availability by checking child SKU stock
 *
 * @param {Object} bundle_config - Bundle configuration with items array
 * @returns {Object} { isInStock: boolean, availableQty: number }
 */
const getBundleAvailability = async (bundle_config) => {
  if (
    !bundle_config ||
    !bundle_config.items ||
    bundle_config.items.length === 0
  ) {
    return { isInStock: false, availableQty: 0 };
  }

  // Get all child SKUs
  const childSkus = bundle_config.items.map((item) => item.sku);

  // Fetch child products (must be SIMPLE)
  const childProducts = await Product.find({
    sku: { $in: childSkus },
    product_type: PRODUCT_TYPES.SIMPLE,
  }).select("sku stock stockObj");

  // Create SKU to stock mapping
  const stockMap = new Map();
  for (const child of childProducts) {
    const stock = child.stockObj?.available ?? child.stock ?? 0;
    stockMap.set(child.sku, stock);
  }

  // Calculate availability: min(floor(childStock / requiredQty)) for each child
  const availabilities = bundle_config.items.map((item) => {
    const childStock = stockMap.get(item.sku);
    if (childStock === undefined) {
      // Child SKU not found → bundle unavailable
      return 0;
    }
    return Math.floor(childStock / item.qty);
  });

  const availableQty = Math.min(...availabilities);

  return {
    isInStock: availableQty > 0,
    availableQty: Math.max(0, availableQty),
  };
};

/**
 * Validate bundle configuration
 *
 * @param {Object} bundle_config - Bundle configuration to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
const validateBundleConfig = async (bundle_config) => {
  const errors = [];

  if (!bundle_config) {
    errors.push("bundle_config is required for BUNDLE products");
    return { valid: false, errors };
  }

  if (!bundle_config.items || bundle_config.items.length === 0) {
    errors.push("bundle_config.items must have at least one item");
    return { valid: false, errors };
  }

  // Validate each item
  const skus = [];
  for (let i = 0; i < bundle_config.items.length; i++) {
    const item = bundle_config.items[i];

    if (!item.sku || typeof item.sku !== "string" || item.sku.trim() === "") {
      errors.push(`Item ${i + 1}: sku is required`);
    } else {
      skus.push(item.sku);
    }

    if (!item.qty || typeof item.qty !== "number" || item.qty < 1) {
      errors.push(`Item ${i + 1}: qty must be a positive number`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Verify child SKUs exist and are SIMPLE products
  const childProducts = await Product.find({
    sku: { $in: skus },
  }).select("sku product_type");

  const foundSkus = new Map();
  for (const p of childProducts) {
    foundSkus.set(p.sku, p.product_type);
  }

  for (const sku of skus) {
    if (!foundSkus.has(sku)) {
      errors.push(`SKU "${sku}" not found`);
    } else {
      const type = foundSkus.get(sku);
      if (type !== PRODUCT_TYPES.SIMPLE) {
        errors.push(
          `SKU "${sku}" is ${type}, only SIMPLE products allowed as bundle children`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Calculate stock deductions for a bundle order
 *
 * @param {Object} bundle_config - Bundle configuration
 * @param {number} quantity - Number of bundles being ordered
 * @returns {Array} Array of { sku, qty } for stock deduction
 */
const calculateBundleStockDeductions = (bundle_config, quantity) => {
  if (!bundle_config || !bundle_config.items) return [];

  return bundle_config.items.map((item) => ({
    sku: item.sku,
    qty: item.qty * quantity,
  }));
};

module.exports = {
  getBundleAvailability,
  validateBundleConfig,
  calculateBundleStockDeductions,
};
