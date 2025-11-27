const User = require("../../models/user");
const PendingUser = require("../../models/PendingUser");
const Token = require("../../models/token");
const { generateAccessToken, generateRefreshToken } = require("../../utils/token");
const { generateOTP, sendOTPEmail } = require("../../services/emailService");

/**
 * Request OTP for login (existing user)
 */
const requestLoginOTP = async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: "No account found with this email. Please register first.",
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email first. Check your inbox for verification link.",
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP request for this email
    await PendingUser.deleteMany({ email: user.email });

    // Create OTP record for login
    const pendingOTP = await PendingUser.create({
      email: user.email,
      otp,
      otpExpires,
      isLoginOTP: true, // Mark as login OTP
    });

    // Send OTP email
    try {
      await sendOTPEmail({ email: user.email, username: user.username }, otp);
      console.log("✅ Login OTP sent to:", user.email);
    } catch (emailError) {
      await PendingUser.deleteOne({ _id: pendingOTP._id });
      console.error("❌ Failed to send login OTP:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your email. Please verify to login.",
      email: user.email,
      expiresIn: "10 minutes",
    });
  } catch (err) {
    console.error("❌ Error requesting login OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Verify OTP and login (existing user)
 */
const verifyLoginOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    // Find OTP record
    const pendingOTP = await PendingUser.findOne({ email: user.email });

    if (!pendingOTP) {
      return res.status(400).json({
        success: false,
        message: "No OTP request found for this email. Please request a new OTP.",
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

    // OTP is valid - Login user
    // Delete OTP record
    await PendingUser.deleteOne({ _id: pendingOTP._id });

    // Remove old refresh tokens
    await Token.deleteMany({ userId: user._id });

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token
    await Token.create({ userId: user._id, refreshToken });

    // Set refresh token as HttpOnly cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "Strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Login successful!",
      accessToken,
      // Don't send refreshToken in response body for security
      // It's now in HttpOnly cookie
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (err) {
    console.error("❌ Error verifying login OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = { requestLoginOTP, verifyLoginOTP };

