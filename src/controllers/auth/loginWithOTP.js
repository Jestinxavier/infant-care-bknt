const User = require("../../models/user");
const PendingUser = require("../../models/PendingUser");
const Token = require("../../models/token");
const logger = require("../../utils/logger");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../utils/token");
const { generateOTP, sendOTPEmail } = require("../../services/emailService");
const { TOKEN_EXPIRY, OTP_EXPIRY_MS } = require("../../../resources/constants");
const {
  getAuthCookieName,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

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
        message:
          "Please verify your email first. Check your inbox for verification link.",
      });
    }

    // Note: Admin role verification is now handled by route-level middleware
    // No platform header checks needed

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);

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
      logger.info("✅ Login OTP sent to:", user.email);
    } catch (emailError) {
      await PendingUser.deleteOne({ _id: pendingOTP._id });
      logger.error("❌ Failed to send login OTP:", emailError);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent to your email. Please verify to login.",
      email: user.email,
      expiresIn: TOKEN_EXPIRY.OTP,
    });
  } catch (err) {
    logger.error("❌ Error requesting login OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

    // Note: Admin role verification is now handled by route-level middleware
    // No platform header checks needed

    // Find OTP record
    const pendingOTP = await PendingUser.findOne({ email: user.email });

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

    // OTP is valid - Login user
    // Delete OTP record
    await PendingUser.deleteOne({ _id: pendingOTP._id });

    // Allow multiple concurrent sessions (e.g. storefront and dashboard)
    // We no longer delete all old refresh tokens on new login.

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token
    await Token.create({ userId: user._id, refreshToken });

    const clientType = req.headers["x-client-type"] === "dashboard" ? "dashboard" : "frontend";
    res.cookie(getAuthCookieName(clientType, "access"), accessToken, getAuthCookieOptions());
    res.cookie(getAuthCookieName(clientType, "refresh"), refreshToken, getRefreshCookieOptions());

    res.status(200).json({
      success: true,
      message: "Login successful!",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (err) {
    logger.error("❌ Error verifying login OTP:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = { requestLoginOTP, verifyLoginOTP };
