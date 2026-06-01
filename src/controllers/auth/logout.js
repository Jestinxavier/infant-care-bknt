const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieClearOptions,
  getAuthCookieName,
} = require("../../utils/authCookieOptions");

const logout = async (req, res) => {
  const clearOpts = getAuthCookieClearOptions();
  const headerClientType = req.headers["x-client-type"];
  const clientType =
    headerClientType === "dashboard"
      ? "dashboard"
      : headerClientType === "frontend"
        ? "frontend"
        : null;

  if (clientType) {
    // Clear only the caller's auth cookies to keep frontend/dashboard sessions independent.
    res.clearCookie(getAuthCookieName(clientType, "access"), clearOpts);
    res.clearCookie(getAuthCookieName(clientType, "refresh"), clearOpts);
  } else {
    // Fallback for old clients that don't send X-Client-Type.
    res.clearCookie(getAuthCookieName("frontend", "access"), clearOpts);
    res.clearCookie(getAuthCookieName("frontend", "refresh"), clearOpts);
    res.clearCookie(getAuthCookieName("dashboard", "access"), clearOpts);
    res.clearCookie(getAuthCookieName("dashboard", "refresh"), clearOpts);
  }

  if (clientType !== "dashboard") {
    // cart_id is a storefront concern; keep admin logout from touching it.
    res.clearCookie("cart_id", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  try {
    const cookies = req.cookies || {};
    const token =
      clientType === "dashboard"
        ? cookies.dashboard_refresh_token
        : clientType === "frontend"
          ? cookies.refresh_token
          : cookies.dashboard_refresh_token || cookies.refresh_token || req.body?.token;

    if (token) {
      await authService.logoutUser(token);
    }
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    // Still return success since cookies are cleared
    logger.error("Token deletion error (non-critical):", err.message);
    res.json({ message: "Logged out successfully" });
  }
};

module.exports = logout;
