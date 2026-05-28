const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieName,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

/**
 * Step 1: Request OTP for registration
 */
const requestOTP = async (req, res) => {
  try {
    logger.info("📧 Request OTP called with:", req.body);

    // Validate email exists
    if (!req.body.email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const result = await authService.requestOTP(req.body);
    logger.info("✅ OTP request successful for:", req.body.email);
    res.status(200).json(result);
  } catch (err) {
    logger.error("❌ OTP request failed:", err.message);
    logger.error("🐞 Full error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Step 2: Verify OTP and complete registration
 */
const verifyOTP = async (req, res) => {
  try {
    const result = await authService.verifyOTPAndRegister(req.body);

    const clientType = req.headers["x-client-type"] === "dashboard" ? "dashboard" : "frontend";
    res.cookie(getAuthCookieName(clientType, "access"), result.accessToken, getAuthCookieOptions());
    res.cookie(getAuthCookieName(clientType, "refresh"), result.refreshToken, getRefreshCookieOptions());

    const { accessToken, refreshToken, ...responseData } = result;
    res.status(201).json(responseData);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = { requestOTP, verifyOTP };
