const User = require("../../models/user");

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

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
      error: error.message
    });
  }
};

module.exports = getProfile;
