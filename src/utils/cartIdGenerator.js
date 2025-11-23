// utils/cartIdGenerator.js
const { customAlphabet } = require("nanoid");

// Generate short, URL-safe cart IDs
// Using custom alphabet: lowercase letters + numbers (no special chars)
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 21); // 21 chars = ~128 bits of entropy

/**
 * Generate a unique cart ID
 * Format: cart_<nanoid>
 * Example: cart_a1b2c3d4e5f6g7h8i9j0k
 */
const generateCartId = () => {
  return `cart_${nanoid()}`;
};

/**
 * Validate cart ID format
 */
const isValidCartId = (cartId) => {
  if (!cartId || typeof cartId !== "string") return false;
  return /^cart_[a-z0-9]{21}$/.test(cartId);
};

module.exports = {
  generateCartId,
  isValidCartId,
};
