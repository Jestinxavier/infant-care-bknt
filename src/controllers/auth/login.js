const authService = require("../../services/service");
const { ACCESS_TOKEN_LIFETIME_MS } = require("../../../resources/constants");
const { getAuthCookieOptions } = require("../../utils/authCookieOptions");

const login = async (req, res) => {
  try {
    // Note: Platform header checks removed - admin access controlled by route prefix
    const { accessToken, refreshToken, user } = await authService.loginUser(
      req.body
    );

    // Set refresh token as HttpOnly cookie
    // Check if request is from dashboard
    const isDashboard =
      req.headers.origin?.includes("localhost:5173") ||
      req.headers.origin?.includes("dashboard");

    const cookieName = isDashboard
      ? "dashboard_refresh_token"
      : "refresh_token";

    res.cookie(cookieName, refreshToken, getAuthCookieOptions());

    // Also set standard cookie for compatibility if needed, or stick to one.
    // Setting both might be confusing but safe if backend checks both.
    // Cookie is set securely. Client will likely use the response body tokens for headers.

    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken, // Include refreshToken in response for client-side storage
      accessTokenLifetimeMs: ACCESS_TOKEN_LIFETIME_MS, // For client-side refresh scheduling
      user, // Include user info in response
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    const status = err.message === "Invalid credentials" ? 401 : 400;
    res.status(status).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = login;
