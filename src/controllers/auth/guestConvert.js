const User = require("../../models/user");
const Order = require("../../models/Order");
const Token = require("../../models/token");
const { generateAccessToken, generateRefreshToken } = require("../../utils/token");
const { getAuthCookieOptions } = require("../../utils/authCookieOptions");

const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 min — matches token.js default
const logger = require("../../utils/logger");

/**
 * POST /api/v1/orders/guest-convert
 * Convert a guest session into a full user account.
 * Verifies identity by matching email against a guest order, then creates the account.
 */
const guestConvert = async (req, res) => {
  try {
    const { orderId, email, password, username } = req.body;

    if (!orderId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Order ID, email, and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Verify guest identity via order
    const order = await Order.findOne({
      orderId: orderId.toUpperCase(),
      isGuestOrder: true,
      "guestInfo.email": normalizedEmail,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "No guest order found with this email. Please check your order ID.",
      });
    }

    // Don't create duplicate accounts
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        errorCode: "ACCOUNT_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      });
    }

    // Create the user account
    const newUser = await User.create({
      username: username || order.guestInfo.name,
      email: normalizedEmail,
      password, // hashed by User pre-save hook
      role: "user",
      isEmailVerified: true, // Email confirmed via the order
    });

    // Reassign all guest orders for this email to the new account
    await Order.updateMany(
      { isGuestOrder: true, "guestInfo.email": normalizedEmail },
      { $set: { userId: newUser._id } },
    );

    // Generate auth tokens
    const accessToken = generateAccessToken(newUser._id);
    const refreshToken = generateRefreshToken(newUser._id);
    await Token.create({ userId: newUser._id, refreshToken });

    const cookieName = process.env.REFRESH_TOKEN_COOKIE_NAME || "refresh_token";
    res.cookie(cookieName, refreshToken, getAuthCookieOptions());

    logger.info(`✅ Guest converted to account: ${normalizedEmail} (user: ${newUser._id})`);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      accessTokenLifetimeMs: ACCESS_TOKEN_LIFETIME_MS,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    logger.error("❌ Error converting guest to account:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = { guestConvert };
