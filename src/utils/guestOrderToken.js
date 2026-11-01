const jwt = require("jsonwebtoken");

/**
 * Signed, expiring token that lets a guest reopen their order tracking page
 * without re-entering the order number and email/phone on every visit.
 *
 * The token is only issued after a successful orderId + contact verification,
 * so possession of it is proof of that verification. It carries no password
 * and can be revoked by rotating JWT_SECRET.
 */

const TOKEN_PURPOSE = "guest-order-access";

const getSecret = () => {
  const secret = process.env.REVIEW_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

const createGuestOrderToken = (order) => {
  if (!order?._id || !order?.isGuestOrder) return null;

  return jwt.sign(
    {
      purpose: TOKEN_PURPOSE,
      orderId: String(order._id),
    },
    getSecret(),
    { expiresIn: process.env.GUEST_ORDER_TOKEN_TTL || "7d" },
  );
};

const verifyGuestOrderToken = (token) => {
  const payload = jwt.verify(token, getSecret());
  if (
    payload?.purpose !== TOKEN_PURPOSE ||
    !payload.orderId
  ) {
    throw new Error("Invalid guest order token");
  }
  return payload;
};

module.exports = { createGuestOrderToken, verifyGuestOrderToken };
