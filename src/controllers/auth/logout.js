const authService = require("../../services/service");

const logout = async (req, res) => {
  // Clear cookies FIRST - always clear regardless of token deletion result
  // This ensures user is logged out even if there's a token database issue
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });
  res.clearCookie("dashboard_refresh_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });
  res.clearCookie("cart_id", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
  });

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
