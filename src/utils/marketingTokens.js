const jwt = require("jsonwebtoken");

/**
 * Signed links used in optional (marketing) emails. Signing means nobody can
 * restore someone else's cart or unsubscribe another address by editing a URL.
 */
const getSecret = () => {
  const secret = process.env.MARKETING_LINK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

/** Opens the reminded cart in any browser (the email may be read elsewhere). */
const createCartRestoreToken = (cartId) =>
  jwt.sign({ purpose: "cart-restore", cartId: String(cartId) }, getSecret(), {
    expiresIn: "14d",
  });

const verifyCartRestoreToken = (token) => {
  const payload = jwt.verify(token, getSecret());
  if (payload?.purpose !== "cart-restore" || !payload.cartId) {
    throw new Error("Invalid cart restore token");
  }
  return payload;
};

/** Long-lived: an unsubscribe link must keep working in old emails. */
const createUnsubscribeToken = (email, category) =>
  jwt.sign(
    {
      purpose: "unsubscribe",
      email: String(email).trim().toLowerCase(),
      category,
    },
    getSecret(),
    { expiresIn: "5y" },
  );

const verifyUnsubscribeToken = (token) => {
  const payload = jwt.verify(token, getSecret());
  if (payload?.purpose !== "unsubscribe" || !payload.email || !payload.category) {
    throw new Error("Invalid unsubscribe token");
  }
  return payload;
};

module.exports = {
  createCartRestoreToken,
  verifyCartRestoreToken,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
};
