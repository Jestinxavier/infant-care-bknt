const authService = require("../../services/service");
const Cart = require("../../models/Cart");

const logout = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user?.id; // Get userId from authenticated request

    await authService.logoutUser(token);

    // Clear user's cart from database when logging out
    if (userId) {
      await Cart.deleteMany({ userId });
      console.log(`🗑️  Cleared cart for user ${userId} on logout`);
    }

    // Clear both cookies to be safe
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

    // Also clear cart_id cookie
    res.clearCookie("cart_id", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      path: "/",
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = logout;
