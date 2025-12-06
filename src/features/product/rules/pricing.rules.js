/**
 * Pricing Domain Rules
 * Pure business logic for pricing calculations
 * No dependencies on Express, MongoDB, or external services
 */

/**
 * Calculate discount percentage
 */
function calculateDiscountPercentage(regularPrice, discountPrice) {
  if (!regularPrice || regularPrice <= 0) return 0;
  if (!discountPrice || discountPrice >= regularPrice) return 0;
  return Math.round(((regularPrice - discountPrice) / regularPrice) * 100);
}

/**
 * Calculate final price after discount
 */
function calculateFinalPrice(regularPrice, discountPrice) {
  return discountPrice && discountPrice > 0 ? discountPrice : regularPrice;
}

/**
 * Validate pricing
 */
function validatePricing(regularPrice, discountPrice) {
  if (regularPrice < 0) {
    return { valid: false, error: "Regular price cannot be negative" };
  }
  if (discountPrice < 0) {
    return { valid: false, error: "Discount price cannot be negative" };
  }
  if (discountPrice > regularPrice) {
    return {
      valid: false,
      error: "Discount price cannot exceed regular price",
    };
  }
  return { valid: true };
}

/**
 * Calculate total price for multiple items
 */
function calculateTotalPrice(items) {
  return items.reduce((total, item) => {
    const price = calculateFinalPrice(item.regularPrice, item.discountPrice);
    return total + price * item.quantity;
  }, 0);
}

/**
 * Apply discount rule
 */
function applyDiscount(price, discountPercentage) {
  if (discountPercentage < 0 || discountPercentage > 100) {
    throw new Error("Discount percentage must be between 0 and 100");
  }
  return price * (1 - discountPercentage / 100);
}

module.exports = {
  calculateDiscountPercentage,
  calculateFinalPrice,
  validatePricing,
  calculateTotalPrice,
  applyDiscount,
};
