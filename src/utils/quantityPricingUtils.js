/**
 * Quantity Pricing Utils
 *
 * Stateless utilities for quantity-based tiered pricing resolution.
 * This is the SINGLE source of truth for quantity pricing logic.
 *
 * ⚠️ ARCHITECTURAL CONSTRAINTS ⚠️
 * - READ-ONLY: Never mutate product data
 * - STATELESS: No external dependencies or side effects
 * - DETERMINISTIC: Same inputs always produce same outputs
 */

/**
 * Validates quantity rules for a product
 *
 * @param {number} basePrice - Base price (or effective price after offer)
 * @param {Array<{minQty: number, price: number}>} rules - Quantity rules
 * @returns {string[]} - Array of validation error messages (empty if valid)
 */
function validateQuantityRules(basePrice, rules) {
  const errors = [];

  if (!rules || rules.length === 0) {
    return errors; // Empty rules are valid (no tiered pricing)
  }

  // Sort by minQty for validation
  const sortedRules = [...rules].sort((a, b) => a.minQty - b.minQty);

  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];

    // minQty must be >= 2
    if (!rule.minQty || rule.minQty < 2) {
      errors.push(`Tier ${i + 1}: Minimum quantity must be at least 2`);
    }

    // price must be > 0
    if (!rule.price || rule.price <= 0) {
      errors.push(`Tier ${i + 1}: Price must be greater than 0`);
    }

    // price must be < basePrice
    if (rule.price && basePrice && rule.price >= basePrice) {
      errors.push(
        `Tier ${i + 1}: Tier price (${
          rule.price
        }) must be less than base price (${basePrice})`,
      );
    }

    // Check strictly increasing minQty
    if (i > 0 && rule.minQty <= sortedRules[i - 1].minQty) {
      errors.push(
        `Tier ${i + 1}: Minimum quantity must be greater than previous tier (${
          sortedRules[i - 1].minQty
        })`,
      );
    }

    // Check strictly decreasing price
    if (i > 0 && rule.price >= sortedRules[i - 1].price) {
      errors.push(
        `Tier ${i + 1}: Price must be less than previous tier (${
          sortedRules[i - 1].price
        })`,
      );
    }
  }

  return errors;
}

/**
 * Resolves unit price based on quantity and tier rules
 *
 * Resolution order:
 * 1. Sort rules by minQty DESC
 * 2. Pick highest rule satisfied by quantity (qty >= rule.minQty)
 * 3. Fallback to effectiveBasePrice
 *
 * @param {number} effectiveBasePrice - Base price (offerPrice if active, else price)
 * @param {Array<{minQty: number, price: number}>} quantityRules - Tier rules
 * @param {number} quantity - Requested quantity
 * @returns {{
 *   unitPrice: number,
 *   basePrice: number,
 *   appliedRule: {minQty: number, price: number} | null,
 *   nextTier: {minQty: number, price: number, unitsNeeded: number} | null,
 *   savings: number
 * }}
 */
function resolveQuantityPrice(effectiveBasePrice, quantityRules, quantity) {
  const result = {
    unitPrice: effectiveBasePrice,
    basePrice: effectiveBasePrice,
    appliedRule: null,
    nextTier: null,
    savings: 0,
  };

  if (!effectiveBasePrice || effectiveBasePrice <= 0) {
    return result;
  }

  if (!quantityRules || quantityRules.length === 0) {
    return result;
  }

  // Only calculate applied rule if quantity >= 2
  if (quantity >= 2) {
    // Sort by minQty DESC to find highest applicable rule
    const sortedRules = [...quantityRules].sort((a, b) => b.minQty - a.minQty);

    // Find applied rule (highest minQty that quantity satisfies)
    for (const rule of sortedRules) {
      if (quantity >= rule.minQty) {
        result.unitPrice = rule.price;
        result.appliedRule = { minQty: rule.minQty, price: rule.price };
        result.savings = (effectiveBasePrice - rule.price) * quantity;
        break;
      }
    }
  }

  // Always calculate next tier (even for qty=1, to encourage bulk purchase)
  const sortedAsc = [...quantityRules].sort((a, b) => a.minQty - b.minQty);
  for (const rule of sortedAsc) {
    if (rule.minQty > quantity) {
      result.nextTier = {
        minQty: rule.minQty,
        price: rule.price,
        unitsNeeded: rule.minQty - quantity,
      };
      break;
    }
  }

  return result;
}

/**
 * Computes pricing for a cart item including quantity tier resolution
 *
 * @param {object} product - Product document with pricing fields
 * @param {object|null} variant - Variant document (optional)
 * @param {number} quantity - Requested quantity
 * @returns {{
 *   unitPrice: number,
 *   basePrice: number,
 *   lineTotal: number,
 *   appliedRule: object|null,
 *   nextTier: object|null,
 *   savings: number,
 *   isOfferActive: boolean
 * }}
 */
function computeCartItemPricing(product, variant, quantity) {
  // Determine effective source (variant overrides product)
  const source = variant || product;

  // Resolve base price (product or variant)
  const basePrice = source.price || product.price || 0;

  // Check for active offer
  const now = new Date();
  const offerPrice = source.offerPrice || product.offerPrice;
  const offerStartAt = source.offerStartAt || product.offerStartAt;
  const offerEndAt = source.offerEndAt || product.offerEndAt;

  let isOfferActive = false;
  let effectiveBasePrice = basePrice;

  if (offerPrice && offerPrice > 0) {
    const startOk = !offerStartAt || now >= new Date(offerStartAt);
    const endOk = !offerEndAt || now <= new Date(offerEndAt);
    if (startOk && endOk) {
      isOfferActive = true;
      effectiveBasePrice = offerPrice;
    }
  }

  // Get quantity rules (variant overrides product if defined)
  const quantityRules =
    variant?.quantityRules?.length > 0
      ? variant.quantityRules
      : product.quantityRules || [];

  // Resolve quantity pricing
  const quantityPricing = resolveQuantityPrice(
    effectiveBasePrice,
    quantityRules,
    quantity,
  );

  return {
    unitPrice: quantityPricing.unitPrice,
    basePrice: effectiveBasePrice,
    originalPrice: basePrice, // For strike-through when offer is active
    lineTotal: quantityPricing.unitPrice * quantity,
    appliedRule: quantityPricing.appliedRule,
    nextTier: quantityPricing.nextTier,
    savings: quantityPricing.savings,
    isOfferActive,
  };
}

/**
 * Formats next tier message for display
 *
 * @param {object} nextTier - Next tier object from resolveQuantityPrice
 * @param {string} template - Message template with placeholders
 * @returns {string|null}
 */
function formatNextTierMessage(
  nextTier,
  template = "Buy {{minQty}} or more and pay ₹{{price}} each",
) {
  if (!nextTier) return null;

  return template
    .replace("{{minQty}}", nextTier.minQty)
    .replace("{{price}}", nextTier.price)
    .replace("{{unitsNeeded}}", nextTier.unitsNeeded);
}

/**
 * Formats savings message for display
 *
 * @param {number} savings - Total savings amount
 * @returns {string|null}
 */
function formatSavingsMessage(savings) {
  if (!savings || savings <= 0) return null;
  return `Quantity offer applied — you saved ₹${savings.toFixed(2)}`;
}

module.exports = {
  validateQuantityRules,
  resolveQuantityPrice,
  computeCartItemPricing,
  formatNextTierMessage,
  formatSavingsMessage,
};
