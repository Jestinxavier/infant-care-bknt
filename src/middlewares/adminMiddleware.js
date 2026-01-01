const User = require("../models/user");
const { ADMIN_ROLES } = require("../../resources/constants");

/**
 * Middleware to require admin role for admin routes
 * Must be used after verifyToken middleware
 */
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - No user ID found",
      });
    }

    // Fetch user from database to check role
    const user = await User.findById(userId).select("role email username");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }
    // Check if user has admin role using centralized constants
    if (!ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    // Attach full user info to request for use in controllers
    req.user = {
      id: user._id,
      role: user.role,
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error) {
    console.error("❌ Admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = requireAdmin;
