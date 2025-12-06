/**
 * Inventory Domain Rules
 * Pure business logic for inventory management
 */

/**
 * Check if variant is in stock
 */
function isInStock(stock) {
  return stock > 0;
}

/**
 * Check if sufficient stock available
 */
function hasSufficientStock(availableStock, requestedQuantity) {
  return availableStock >= requestedQuantity;
}

/**
 * Calculate available stock after reservation
 */
function reserveStock(currentStock, quantity) {
  if (!hasSufficientStock(currentStock, quantity)) {
    throw new Error("Insufficient stock");
  }
  return currentStock - quantity;
}

/**
 * Release reserved stock
 */
function releaseStock(currentStock, quantity) {
  return currentStock + quantity;
}

/**
 * Validate stock quantity
 */
function validateStockQuantity(quantity) {
  if (quantity < 0) {
    return { valid: false, error: "Stock quantity cannot be negative" };
  }
  if (!Number.isInteger(quantity)) {
    return { valid: false, error: "Stock quantity must be an integer" };
  }
  return { valid: true };
}

/**
 * Check low stock threshold
 */
function isLowStock(currentStock, threshold = 10) {
  return currentStock > 0 && currentStock <= threshold;
}

/**
 * Check out of stock
 */
function isOutOfStock(stock) {
  return stock === 0;
}

module.exports = {
  isInStock,
  hasSufficientStock,
  reserveStock,
  releaseStock,
  validateStockQuantity,
  isLowStock,
  isOutOfStock,
};
