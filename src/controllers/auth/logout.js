const authService = require("../../services/service");
const { getAuthCookieClearOptions } = require("../../utils/authCookieOptions");

const logout = async (req, res) => {
  // Clear cookies FIRST - always clear regardless of token deletion result
  // Options must match the ones used when setting the cookie (e.g. sameSite for production)
  const clearOpts = getAuthCookieClearOptions();
  res.clearCookie("refresh_token", clearOpts);
  res.clearCookie("dashboard_refresh_token", clearOpts);
  res.clearCookie("cart_id", clearOpts);

  try {
    const { token } = req.body;
    // Try to delete token from DB, but don't fail logout if this errors
    if (token) {
      await authService.logoutUser(token);
    }
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    // Still return success since cookies are cleared
    console.error("Token deletion error (non-critical):", err.message);
    res.json({ message: "Logged out successfully" });
  }
};

module.exports = logout;
