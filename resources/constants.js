const TEST_MODE = true;
const TEST_OTP = "123456";

// required cookies
const CART_ID = "cart_id";
const ACCESS_TOKEN = "access_token";
const REFRESH_TOKEN = "refresh_token";

// Payment method constants
const PAYMENT_METHODS = {
  COD: "cod",
  RAZORPAY: "razorpay",
  PHONEPE: "phonepe",
};

const TOKEN_EXPIRY = {
  ACCESS_TOKEN: "15m",
  REFRESH_TOKEN: "7d",
  OTP: "10m", // OTP expiry time
};

// OTP expiry in milliseconds (for Date calculations)
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

module.exports = {
  TEST_MODE,
  TEST_OTP,
  CART_ID,
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  PAYMENT_METHODS,
  TOKEN_EXPIRY,
  OTP_EXPIRY_MS,
};
