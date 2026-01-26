const TEST_MODE = true;
const TEST_OTP = "123456";

// required cookies
const CART_ID = "cart_id";
const ACCESS_TOKEN = "access_token";
const REFRESH_TOKEN = "refresh_token";

// Payment method constants
const PAYMENT_METHODS = {
  COD: "COD",
  PHONEPE: "PHONEPE",
};

const TOKEN_EXPIRY = {
  ACCESS_TOKEN: "15m",
  REFRESH_TOKEN: "7d",
  OTP: "10m", // OTP expiry time
};

// Access token lifetime in milliseconds (14 min - 1 min buffer before 15m expiry)
// Used by frontend/dashboard to set refresh interval
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000;

// OTP expiry in milliseconds (for Date calculations)
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const SHIPPING_COST = {
  FREE_THRESHOLD: 1000,
  SHIPPING_COST: 60,
};

// Checkout session duration (5 minutes)
const CHECKOUT_SESSION_MS = 5 * 60 * 1000;

// Stock notification statuses
const STOCK_NOTIFICATION_STATUS = {
  PENDING: "pending",
  NOTIFIED: "notified",
  EXPIRED: "expired",
};

// User roles
const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super-admin",
  DEVELOPER: "developer",
};

// Admin roles (roles with admin access)
const ADMIN_ROLES = [
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.DEVELOPER,
];

module.exports = {
  TEST_MODE,
  TEST_OTP,
  CART_ID,
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  PAYMENT_METHODS,
  TOKEN_EXPIRY,
  ACCESS_TOKEN_LIFETIME_MS,
  OTP_EXPIRY_MS,
  SHIPPING_COST,
  CHECKOUT_SESSION_MS,
  STOCK_NOTIFICATION_STATUS,
  USER_ROLES,
  ADMIN_ROLES,
};
