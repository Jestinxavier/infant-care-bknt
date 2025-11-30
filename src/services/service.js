const jwt = require("jsonwebtoken");
const User = require("../models/user");
const PendingUser = require("../models/PendingUser");
const Token = require("../models/token");
const { generateAccessToken, generateRefreshToken } = require("../utils/token");
const {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
} = require("./emailService");

/**
 * Step 1: Request OTP - Only email needed
 */
exports.requestOTP = async ({ email }) => {
  // Check if email already exists in verified users

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("Email is already registered");
  }

  // Generate OTP
  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing OTP request for this email
  await PendingUser.deleteMany({ email });

  // Create OTP record (no user data stored yet)
  const pendingOTP = await PendingUser.create({
    email,
    otp,
    otpExpires,
  });

  // Send OTP email
  try {
    await sendOTPEmail({ email }, otp);
    console.log("✅ OTP sent to:", email);
  } catch (emailError) {
    // Delete OTP record if email fails
    await PendingUser.deleteOne({ _id: pendingOTP._id });
    console.error("❌ Failed to send OTP:", emailError);
    throw new Error("Failed to send OTP email. Please try again.");
  }

  return {
    success: true,
    message: "OTP sent to your email. Please verify to complete registration.",
    email: email,
    expiresIn: "10 minutes",
  };
};

/**
 * Step 2: Verify OTP and create user account with all data
 */
exports.verifyOTPAndRegister = async ({
  email,
  username,
  password,
  otp,
  role,
}) => {
  // Check if email already registered
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("Email is already registered");
  }

  // Check if username already taken
  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    throw new Error("Username is already taken");
  }

  // Find OTP record
  const pendingOTP = await PendingUser.findOne({ email });

  if (!pendingOTP) {
    throw new Error(
      "No OTP request found for this email. Please request a new OTP."
    );
  }

  // Check if OTP expired
  if (pendingOTP.otpExpires < Date.now()) {
    await PendingUser.deleteOne({ _id: pendingOTP._id });
    throw new Error("OTP has expired. Please request a new one.");
  }

  // Check attempts
  if (pendingOTP.attempts >= 5) {
    await PendingUser.deleteOne({ _id: pendingOTP._id });
    throw new Error("Too many failed attempts. Please request a new OTP.");
  }

  // Verify OTP
  if (pendingOTP.otp !== otp) {
    pendingOTP.attempts += 1;
    await pendingOTP.save();
    throw new Error(
      `Invalid OTP. ${5 - pendingOTP.attempts} attempts remaining.`
    );
  }

  // OTP is valid - Create user account
  const user = await User.create({
    username,
    email,
    password, // Will be hashed by pre-save hook
    role: role || "user",
    isEmailVerified: true, // Email verified via OTP
  });

  // Delete OTP record
  await PendingUser.deleteOne({ _id: pendingOTP._id });

  // Generate tokens
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Store refresh token
  await Token.create({ userId: user._id, refreshToken });

  // Send welcome email
  try {
    await sendWelcomeEmail(user);
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
  }

  return {
    success: true,
    message: "Registration successful! Welcome to Online Shopping.",
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

exports.loginUser = async ({ email, password }) => {
  // Normalize email (lowercase and trim)
  const normalizedEmail = email?.toLowerCase()?.trim();
  if (!normalizedEmail) throw new Error("Email is required");

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    console.error(
      "❌ Login failed: User not found for email:",
      normalizedEmail
    );
    throw new Error("Invalid credentials");
  }

  if (!password) {
    console.error("❌ Login failed: Password not provided");
    throw new Error("Password is required");
  }

  // Debug: Log password comparison attempt (don't log actual password)
  console.log("🔐 Attempting password comparison for user:", user.email);
  console.log("🔐 Password hash exists:", !!user.password);
  console.log(
    "🔐 Password hash starts with $2:",
    user.password?.startsWith("$2")
  );

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    console.error(
      "❌ Login failed: Password mismatch for user:",
      normalizedEmail
    );
    throw new Error("Invalid credentials");
  }

  console.log("✅ Password verified successfully for user:", normalizedEmail);

  // Check if email is verified
  if (!user.isEmailVerified) {
    throw new Error(
      "Please verify your email before logging in. Check your inbox for the verification link."
    );
  }

  // Note: Admin role verification is now handled by route-level middleware
  // No platform header checks needed

  // Remove old refresh tokens (only one active refresh token per user)
  await Token.deleteMany({ userId: user._id });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  await Token.create({ userId: user._id, refreshToken });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

exports.refreshAccessToken = async (refreshToken) => {
  const tokenDoc = await Token.findOne({ refreshToken });
  if (!tokenDoc) throw new Error("Invalid refresh token");

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const accessToken = generateAccessToken(decoded.id);
    return accessToken;
  } catch (err) {
    throw new Error("Expired or invalid refresh token");
  }
};

exports.logoutUser = async (refreshToken) => {
  await Token.findOneAndDelete({ refreshToken });
};

/**
 * Resend OTP
 */
exports.resendOTP = async (email) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("Email is already registered and verified");
  }

  // Find pending user
  const pendingUser = await PendingUser.findOne({ email });
  if (!pendingUser) {
    throw new Error("No pending registration found for this email");
  }

  // Generate new OTP
  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  pendingUser.otp = otp;
  pendingUser.otpExpires = otpExpires;
  pendingUser.attempts = 0; // Reset attempts
  await pendingUser.save();

  // Send OTP email
  await sendOTPEmail(
    { email: pendingUser.email, username: pendingUser.username },
    otp
  );

  return {
    success: true,
    message: "New OTP sent to your email",
    expiresIn: "10 minutes",
  };
};
