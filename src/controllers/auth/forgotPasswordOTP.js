const User = require("../../models/user");
const PendingUser = require("../../models/PendingUser");
const { generateOTP, sendOTPEmail } = require("../../services/emailService");
const { TOKEN_EXPIRY, OTP_EXPIRY_MS } = require("../../../resources/constants");

/**
 * Request OTP for password reset
 */
const requestPasswordResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, an OTP has been sent.",
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message:
          "Please verify your email first. Check your inbox for verification link.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);

    // Delete any existing password reset OTP request for this email
    await PendingUser.deleteMany({ 
      email: user.email,
      isPasswordResetOTP: true 
    });

    // Create OTP record for password reset
    const pendingOTP = await PendingUser.create({
      email: user.email,
      otp,
      otpExpires,
      isPasswordResetOTP: true, // Mark as password reset OTP
    });

    // Send OTP email
    try {
      await sendOTPEmail({ email: user.email, username: user.username }, otp);
      console.log("✅ Password reset OTP sent to:", user.email);
    } catch (emailError) {
      await PendingUser.deleteOne({ _id: pendingOTP._id });
      console.error("❌ Failed to send password reset OTP:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "If an account exists with this email, an OTP has been sent.",
      email: user.email,
      expiresIn: TOKEN_EXPIRY.OTP,
    });
  } catch (err) {
    console.error("❌ Error requesting password reset OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Verify OTP and reset password
 */
const verifyPasswordResetOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP, and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    // Find password reset OTP record
    const pendingOTP = await PendingUser.findOne({ 
      email: user.email,
      isPasswordResetOTP: true 
    });

    if (!pendingOTP) {
      return res.status(400).json({
        success: false,
        message:
          "No OTP request found for this email. Please request a new OTP.",
      });
    }

    // Check if OTP expired
    if (pendingOTP.otpExpires < Date.now()) {
      await PendingUser.deleteOne({ _id: pendingOTP._id });
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Check attempts
    if (pendingOTP.attempts >= 5) {
      await PendingUser.deleteOne({ _id: pendingOTP._id });
      return res.status(400).json({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (pendingOTP.otp !== otp) {
      pendingOTP.attempts += 1;
      await pendingOTP.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${5 - pendingOTP.attempts} attempts remaining.`,
      });
    }

    // OTP is valid - Reset password
    // Delete OTP record
    await PendingUser.deleteOne({ _id: pendingOTP._id });

    // Update password
    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (err) {
    console.error("❌ Error verifying password reset OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = { requestPasswordResetOTP, verifyPasswordResetOTP };
