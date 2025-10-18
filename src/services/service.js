const jwt = require("jsonwebtoken");
const User = require("../models/user");
const PendingUser = require("../models/PendingUser");
const Token = require("../models/token");
const { generateAccessToken, generateRefreshToken } = require("../utils/token");
const { 
  generateOTP, 
  sendOTPEmail, 
  sendWelcomeEmail 
} = require("./emailService");

/**
 * Step 1: Request OTP - Send OTP to email (user not created yet)
 */
exports.requestOTP = async ({ username, email, password, role }) => {
  // Check if email or username already exists in verified users
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new Error("User already exists with this email or username");
  }

  // Generate OTP
  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing pending registration for this email
  await PendingUser.deleteMany({ email });

  // Create pending user (password will NOT be hashed yet)
  const pendingUser = await PendingUser.create({ 
    username, 
    email, 
    password, // Store plain password temporarily
    role: role || 'user',
    otp,
    otpExpires
  });

  // Send OTP email
  try {
    await sendOTPEmail({ email, username }, otp);
    console.log('✅ OTP sent to:', email);
  } catch (emailError) {
    // Delete pending user if email fails
    await PendingUser.deleteOne({ _id: pendingUser._id });
    console.error('❌ Failed to send OTP:', emailError);
    throw new Error('Failed to send OTP email. Please try again.');
  }

  return {
    success: true,
    message: 'OTP sent to your email. Please verify to complete registration.',
    email: email,
    expiresIn: '10 minutes'
  };
};

/**
 * Step 2: Verify OTP and create user account
 */
exports.verifyOTPAndRegister = async ({ email, otp }) => {
  // Find pending user
  const pendingUser = await PendingUser.findOne({ email });
  
  if (!pendingUser) {
    throw new Error("No pending registration found for this email");
  }

  // Check if OTP expired
  if (pendingUser.otpExpires < Date.now()) {
    await PendingUser.deleteOne({ _id: pendingUser._id });
    throw new Error("OTP has expired. Please request a new one.");
  }

  // Check attempts
  if (pendingUser.attempts >= 5) {
    await PendingUser.deleteOne({ _id: pendingUser._id });
    throw new Error("Too many failed attempts. Please request a new OTP.");
  }

  // Verify OTP
  if (pendingUser.otp !== otp) {
    pendingUser.attempts += 1;
    await pendingUser.save();
    throw new Error(`Invalid OTP. ${5 - pendingUser.attempts} attempts remaining.`);
  }

  // OTP is valid - Create actual user account
  const user = await User.create({
    username: pendingUser.username,
    email: pendingUser.email,
    password: pendingUser.password, // Will be hashed by pre-save hook
    role: pendingUser.role,
    isEmailVerified: true // Email is verified via OTP
  });

  // Delete pending user
  await PendingUser.deleteOne({ _id: pendingUser._id });

  // Send welcome email
  try {
    await sendWelcomeEmail(user);
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
  }

  return {
    success: true,
    message: 'Email verified successfully! Your account has been created.',
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    }
  };
};

exports.loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid credentials");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new Error("Invalid credentials");

  // Check if email is verified
  if (!user.isEmailVerified) {
    throw new Error("Please verify your email before logging in. Check your inbox for the verification link.");
  }

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
      isEmailVerified: user.isEmailVerified
    }
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
  await sendOTPEmail({ email: pendingUser.email, username: pendingUser.username }, otp);

  return {
    success: true,
    message: "New OTP sent to your email",
    expiresIn: '10 minutes'
  };
};
