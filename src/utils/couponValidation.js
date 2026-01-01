const Coupon = require("../models/Coupon");

/**
 * Soft validation - Check if coupon is valid without consuming it
 * This is for cart-level validation before payment
 */
const validateCoupon = async (couponCode, cartSubtotal, userId) => {
  const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

  if (!coupon) {
    return {
      valid: false,
      error: "INVALID_COUPON",
      message: "Coupon not found",
    };
  }

  if (!coupon.isActive) {
    return {
      valid: false,
      error: "COUPON_INACTIVE",
      message: "This coupon has been disabled",
    };
  }

  const now = new Date();
  if (now < coupon.startDate) {
    return {
      valid: false,
      error: "COUPON_NOT_STARTED",
      message: "This coupon is not yet active",
    };
  }

  if (now > coupon.endDate) {
    return {
      valid: false,
      error: "COUPON_EXPIRED",
      message: "This coupon has expired",
    };
  }

  if (cartSubtotal < coupon.minCartValue) {
    return {
      valid: false,
      error: "MIN_CART_NOT_MET",
      message: `Minimum cart value of ₹${coupon.minCartValue} required`,
    };
  }

  // Soft check for usage limit (not atomic)
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return {
      valid: false,
      error: "USAGE_LIMIT_REACHED",
      message: "This coupon has been fully redeemed",
    };
  }

  // Calculate discount
  let discount = 0;
  if (coupon.type === "flat") {
    discount = Math.min(coupon.value, cartSubtotal);
  } else if (coupon.type === "percentage") {
    discount = (cartSubtotal * coupon.value) / 100;
    if (coupon.maxDiscount) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  }

  // Safety: discount cannot exceed cart total
  discount = Math.min(discount, cartSubtotal);

  return {
    valid: true,
    coupon,
    discount,
  };
};

/**
 * Atomic consumption - Actually consume the coupon at checkout
 * This is race-condition safe using MongoDB atomic operations
 *
 * @param {string} couponCode - Coupon code to consume
 * @param {number} cartSubtotal - Cart subtotal for validation
 * @param {string} userId - User ID
 * @param {ClientSession} session - Optional MongoDB session for transactions
 * @returns {Object} { success: true, coupon } OR { success: false, error, message }
 */
const consumeCoupon = async (
  couponCode,
  cartSubtotal,
  userId,
  session = null
) => {
  const now = new Date();

  // Build query options
  const queryOptions = session ? { new: true, session } : { new: true };

  // Atomic update with conditional matching
  const result = await Coupon.findOneAndUpdate(
    {
      code: couponCode.toUpperCase(),
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      minCartValue: { $lte: cartSubtotal },
      $or: [
        { usageLimit: null }, // Unlimited coupons
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } }, // Still has quota
      ],
    },
    {
      $inc: { usedCount: 1 },
    },
    queryOptions
  );

  // If no document matched, coupon is invalid or exhausted
  if (!result) {
    // Re-check to provide specific error
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
      return {
        success: false,
        error: "INVALID_COUPON",
        message: "Coupon not found",
      };
    }
    if (!coupon.isActive) {
      return {
        success: false,
        error: "COUPON_INACTIVE",
        message: "This coupon has been disabled",
      };
    }
    if (now < coupon.startDate || now > coupon.endDate) {
      return {
        success: false,
        error: "COUPON_EXPIRED",
        message: "This coupon has expired",
      };
    }
    if (cartSubtotal < coupon.minCartValue) {
      return {
        success: false,
        error: "MIN_CART_NOT_MET",
        message: `Minimum cart value of ₹${coupon.minCartValue} required`,
      };
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return {
        success: false,
        error: "COUPON_EXHAUSTED",
        message: "Sorry, this coupon has just been fully redeemed",
      };
    }

    return {
      success: false,
      error: "COUPON_INVALID",
      message: "Coupon is not valid",
    };
  }

  // Calculate discount
  let discount = 0;
  if (result.type === "flat") {
    discount = Math.min(result.value, cartSubtotal);
  } else if (result.type === "percentage") {
    discount = (cartSubtotal * result.value) / 100;
    if (result.maxDiscount) {
      discount = Math.min(discount, result.maxDiscount);
    }
  }

  // Safety: discount cannot exceed cart total
  discount = Math.min(discount, cartSubtotal);

  return {
    success: true,
    coupon: result,
    discount,
  };
};

module.exports = {
  validateCoupon,
  consumeCoupon,
};
