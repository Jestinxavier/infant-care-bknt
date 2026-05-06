const authService = require("../../services/service");
const logger = require("../../utils/logger");
const { ACCESS_TOKEN_LIFETIME_MS } = require("../../../resources/constants");
const { getAuthCookieOptions } = require("../../utils/authCookieOptions");

const login = async (req, res) => {
  try {
    // Note: Platform header checks removed - admin access controlled by route prefix
    const { accessToken, refreshToken, user } = await authService.loginUser(
      req.body
    );

    // Identify client from the explicit header, not user-controlled Origin
    const isDashboard = req.headers["x-client-type"] === "dashboard";
    const cookieName = isDashboard ? "dashboard_refresh_token" : "refresh_token";
    res.cookie(cookieName, refreshToken, getAuthCookieOptions());

    // Refresh token is only in the HttpOnly cookie — never in the response body.
    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      accessTokenLifetimeMs: ACCESS_TOKEN_LIFETIME_MS,
      user,
    });
  } catch (err) {
    logger.error("❌ Login error:", err.message);
    const status = err.message === "Invalid credentials" ? 401 : 400;
    res.status(status).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = login;
