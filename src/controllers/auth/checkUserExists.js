const User = require("../../models/user");
const PendingUser = require("../../models/PendingUser");

/**
 * Check if user exists by email
 */
const checkUserExists = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    res.status(200).json({
      success: true,
      exists: !!user,
      message: user
        ? "User exists with this email"
        : "No user found with this email",
    });
  } catch (err) {
    console.error("❌ Error checking user:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = checkUserExists;

