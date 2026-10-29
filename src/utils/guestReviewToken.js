const jwt = require("jsonwebtoken");

const getSecret = () => {
  const secret = process.env.REVIEW_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

const createGuestReviewToken = (order) => {
  const email = order?.guestInfo?.email;
  if (!order?._id || !email) return null;

  return jwt.sign(
    {
      purpose: "guest-review",
      orderId: String(order._id),
      email: String(email).trim().toLowerCase(),
    },
    getSecret(),
    { expiresIn: "30d" },
  );
};

const verifyGuestReviewToken = (token) => {
  const payload = jwt.verify(token, getSecret());
  if (payload?.purpose !== "guest-review" || !payload.orderId || !payload.email) {
    throw new Error("Invalid guest review token");
  }
  return payload;
};

module.exports = { createGuestReviewToken, verifyGuestReviewToken };
