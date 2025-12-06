/**
 * Discount Domain Rules
 * Pure business logic for discount calculations
 */

/**
 * Apply percentage discount
 */
function applyPercentageDiscount(amount, percentage) {
  if (percentage < 0 || percentage > 100) {
    throw new Error("Discount percentage must be between 0 and 100");
  }
  return amount * (percentage / 100);
}

/**
 * Apply fixed discount
 */
function applyFixedDiscount(amount, discount) {
  if (discount < 0) {
    throw new Error("Discount cannot be negative");
  }
  return Math.min(discount, amount); // Don't allow negative totals
}

/**
 * Calculate discount amount
 */
function calculateDiscountAmount(amount, discountType, discountValue) {
  if (discountType === "percentage") {
    return applyPercentageDiscount(amount, discountValue);
  } else if (discountType === "fixed") {
    return applyFixedDiscount(amount, discountValue);
  }
  throw new Error("Invalid discount type");
}

/**
 * Validate discount
 */
function validateDiscount(discountType, discountValue, minOrderAmount = 0) {
  if (!["percentage", "fixed"].includes(discountType)) {
    return {
      valid: false,
      error: "Discount type must be 'percentage' or 'fixed'",
    };
  }

  if (
    discountType === "percentage" &&
    (discountValue < 0 || discountValue > 100)
  ) {
    return {
      valid: false,
      error: "Percentage discount must be between 0 and 100",
    };
  }

  if (discountType === "fixed" && discountValue < 0) {
    return { valid: false, error: "Fixed discount cannot be negative" };
  }

  if (minOrderAmount < 0) {
    return { valid: false, error: "Minimum order amount cannot be negative" };
  }

  return { valid: true };
}

/**
 * Check if discount is applicable
 */
function isDiscountApplicable(orderAmount, minOrderAmount) {
  return orderAmount >= minOrderAmount;
}

module.exports = {
  applyPercentageDiscount,
  applyFixedDiscount,
  calculateDiscountAmount,
  validateDiscount,
  isDiscountApplicable,
};
