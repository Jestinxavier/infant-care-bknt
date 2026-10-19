const User = require("../../models/user");
const logger = require("../../utils/logger");
const toCamelCase = require("../../utils/toCamelCase");

const updateProfile = async (req, res) => {
  try {
    // req.user is set by authMiddleware after token verification
    const userId = req.user.id;
    const { username: rawUsername, email, phone } = req.body;

    // Usernames are always persisted camelCase ("John Doe" -> "johnDoe").
    const username = rawUsername ? toCamelCase(rawUsername) : rawUsername;

    // Find user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Handle avatar upload if file is present
    if (req.file && req.file.path) {
      user.avatar = req.file.path; // Cloudinary URL
    }

    // Check if username is being changed and if it's already taken
    if (username && username !== user.username) {
      if (username.length < 3) {
        return res.status(400).json({
          success: false,
          message: "Username must be at least 3 characters"
        });
      }
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Username is already taken"
        });
      }
      user.username = username;
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already registered"
        });
      }
      user.email = email.toLowerCase().trim();
      // If email is changed, mark as unverified
      user.isEmailVerified = false;
    }

    // Update phone if provided
    if (phone !== undefined) {
      user.phone = phone;
    }

    // Save updated user
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
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
    logger.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
          });
  }
};

module.exports = updateProfile;

