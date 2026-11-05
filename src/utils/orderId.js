const crypto = require("crypto");

/**
 * Customer-facing order number: 8 hex characters, e.g. "AE698036".
 * Shared by web checkout and the POS so the format lives in one place.
 */
const generateOrderId = () => crypto.randomBytes(4).toString("hex").toUpperCase();

/** True when an insert failed only because the generated orderId was taken. */
const isOrderIdCollision = (err) =>
  err?.code === 11000 && Boolean(err?.keyPattern?.orderId || err?.keyValue?.orderId);

/** How many fresh order numbers to try before giving up. */
const ORDER_ID_ATTEMPTS = 5;

module.exports = { generateOrderId, isOrderIdCollision, ORDER_ID_ATTEMPTS };
