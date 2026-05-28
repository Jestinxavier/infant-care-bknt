const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieClearOptions,
  getAuthCookieName,
} = require("../../utils/authCookieOptions");

const logout = async (req, res) => {
  const clearOpts = getAuthCookieClearOptions();
  res.clearCookie(getAuthCookieName("frontend", "access"), clearOpts);
  res.clearCookie(getAuthCookieName("frontend", "refresh"), clearOpts);
  res.clearCookie(getAuthCookieName("dashboard", "access"), clearOpts);
  res.clearCookie(getAuthCookieName("dashboard", "refresh"), clearOpts);
  // cart_id is set with sameSite: "lax" (not "none"), so clear with matching options
  res.clearCookie("cart_id", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  try {
    const cookies = req.cookies || {};
    const token =
      cookies.dashboard_refresh_token ||
      cookies.refresh_token ||
      req.body?.token;

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
