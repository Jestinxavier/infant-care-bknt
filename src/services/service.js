const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Token = require("../models/token");
const { generateAccessToken, generateRefreshToken } = require("../utils/token");

exports.registerUser = async ({ username, email, password, role }) => {
  // check if email or username already exists
  const userExists = await User.findOne({ $or: [{ email }, { username }] });
  if (userExists) throw new Error("User already exists with this email or username");

  // Create user (password will be hashed by pre-save hook)
  const user = await User.create({ username, email, password, role });

  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role
  };
};

exports.loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid credentials");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new Error("Invalid credentials");

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
      role: user.role
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
