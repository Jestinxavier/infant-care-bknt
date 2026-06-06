const User = require("../../models/user");
const logger = require("../../utils/logger");
const { ADMIN_ROLES } = require("../../../resources/constants");
const {
  getAuthCookieClearOptions,
  getAuthCookieName,
  getRequestClientType,
} = require("../../utils/authCookieOptions");

const getProfile = async (req, res) => {
  try {
    // req.user is set by authMiddleware after token verification
    const userId = req.user.id;

    // Fetch user from database excluding password
    const user = await User.findById(userId).select("-password -emailOTP -emailOTPExpires");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const clientType = getRequestClientType(req);
    if (clientType === "dashboard" && !ADMIN_ROLES.includes(user.role)) {
      const clearOpts = getAuthCookieClearOptions();
      res.clearCookie(getAuthCookieName("dashboard", "access"), clearOpts);
      res.clearCookie(getAuthCookieName("dashboard", "refresh"), clearOpts);
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    logger.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
          });
  }
};

module.exports = getProfile;
