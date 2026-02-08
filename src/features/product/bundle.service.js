/**
 * Bundle Service
 *
 * Handles bundle-specific business logic:
 * - Stock availability resolution
 * - Bundle validation
 *
 * ⚠️ ARCHITECTURAL CONSTRAINT ⚠️
 * This service is READ-ONLY at cart level.
 * - ❌ NEVER write/mutate stock
 * - ❌ NEVER reserve stock
 * - ✅ READ-ONLY queries only
 *
 * Stock is only deducted during ORDER CREATION (atomic transaction).
 * This ensures cart operations are fast and non-blocking.
 */

const Product = require("../../models/Product");

const PRODUCT_TYPES = {
  SIMPLE: "SIMPLE",
  CONFIGURABLE: "CONFIGURABLE",
  BUNDLE: "BUNDLE",
};

/**
 * Get bundle availability by checking child SKU stock
 *
 * 🔒 READ-ONLY: This function ONLY reads stock, never mutates it.
 * Stock reservation/deduction happens ONLY at order creation.
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

  // Resolve stock from SIMPLE (root sku) and CONFIGURABLE (variant sku)
  const stockMap = new Map();

  // SIMPLE: fetch by root sku
  const simpleProducts = await Product.find({
    sku: { $in: childSkus },
    product_type: PRODUCT_TYPES.SIMPLE,
  }).select("sku stock stockObj");

  for (const p of simpleProducts) {
    stockMap.set(p.sku, p.stockObj?.available ?? p.stock ?? 0);
  }

  // Variant SKUs: fetch CONFIGURABLE products with matching variant sku
  const variantSkus = childSkus.filter((sku) => !stockMap.has(sku));
  if (variantSkus.length > 0) {
    const configurableProducts = await Product.find({
      "variants.sku": { $in: variantSkus },
    }).select("variants.sku variants.stockObj variants.stock");

    for (const p of configurableProducts) {
      for (const v of p.variants || []) {
        if (variantSkus.includes(v.sku)) {
          stockMap.set(v.sku, v.stockObj?.available ?? v.stock ?? 0);
        }
      }
    }
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

  // Verify child SKUs: must be SIMPLE (root sku) or CONFIGURABLE variant
  const simpleProducts = await Product.find({
    sku: { $in: skus },
    product_type: PRODUCT_TYPES.SIMPLE,
  }).select("sku product_type");

  const foundSkus = new Map(); // sku -> "SIMPLE" | "CONFIGURABLE"
  for (const p of simpleProducts) {
    foundSkus.set(p.sku, p.product_type);
  }

  const unfoundSkus = skus.filter((s) => !foundSkus.has(s));
  if (unfoundSkus.length > 0) {
    const variantProducts = await Product.find({
      "variants.sku": { $in: unfoundSkus },
    }).select("product_type variants.sku");

    for (const p of variantProducts) {
      for (const v of p.variants || []) {
        if (
          unfoundSkus.includes(v.sku) &&
          p.product_type === PRODUCT_TYPES.CONFIGURABLE
        ) {
          foundSkus.set(v.sku, "CONFIGURABLE");
        }
      }
    }
  }

  for (const sku of skus) {
    if (!foundSkus.has(sku)) {
      errors.push(`SKU "${sku}" not found`);
    }
    // Both SIMPLE and CONFIGURABLE (variant) are valid - no type restriction
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
