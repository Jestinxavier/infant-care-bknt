/**
 * Order Domain Rules
 * Pure business logic for order management
 */

/**
 * Calculate order subtotal
 */
function calculateSubtotal(items) {
  return items.reduce((total, item) => {
    return total + item.price * item.quantity;
  }, 0);
}

/**
 * Calculate order total
 */
function calculateOrderTotal(subtotal, shippingCost = 0, discount = 0) {
  return Math.max(0, subtotal + shippingCost - discount);
}

/**
 * Validate order items
 */
function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: "Order must have at least one item" };
  }

  for (const item of items) {
    if (!item.variantId || !item.quantity || !item.price) {
      return {
        valid: false,
        error: "Each item must have variantId, quantity, and price",
      };
    }
    if (item.quantity <= 0) {
      return { valid: false, error: "Item quantity must be greater than 0" };
    }
    if (item.price < 0) {
      return { valid: false, error: "Item price cannot be negative" };
    }
  }

  return { valid: true };
}

/**
 * Check if order can be cancelled
 */
function canCancelOrder(orderStatus) {
  const cancellableStatuses = ["processing", "pending"];
  return cancellableStatuses.includes(orderStatus);
}

/**
 * Check if order can be returned
 */
function canReturnOrder(orderStatus, paymentStatus) {
  return orderStatus === "delivered" && paymentStatus === "paid";
}

/**
 * Calculate shipping cost based on order value
 */
function calculateShippingCost(subtotal, freeShippingThreshold = 500) {
  if (subtotal >= freeShippingThreshold) {
    return 0;
  }
  // Default shipping cost
  return 60;
}

/**
 * Validate order status transition
 */
function canTransitionStatus(currentStatus, newStatus) {
  const validTransitions = {
    pending: ["confirmed", "processing", "cancelled"],
    confirmed: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered", "cancelled"],
    delivered: ["returned"],
    cancelled: [],
    returned: [],
  };

  const allowed = validTransitions[currentStatus];
  // Unknown current status (schema mismatch) — allow admin to correct it
  if (allowed === undefined) return true;
  return allowed.includes(newStatus);
}

module.exports = {
  calculateSubtotal,
  calculateOrderTotal,
  validateOrderItems,
  canCancelOrder,
  canReturnOrder,
  calculateShippingCost,
  canTransitionStatus,
};
