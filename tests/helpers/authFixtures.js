const User = require("../../src/models/user");
const PendingUser = require("../../src/models/PendingUser");
const Token = require("../../src/models/token");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../../src/utils/token");
const { TEST_OTP, OTP_EXPIRY_MS } = require("../../resources/constants");

let counter = 0;

const uniqueEmail = (prefix = "user") =>
  `${prefix}.${Date.now()}.${counter++}@example.com`;

const uniqueUsername = (prefix = "user") =>
  `${prefix}${Date.now()}${counter++}`;

const createVerifiedUser = async (overrides = {}) =>
  User.create({
    username: uniqueUsername(),
    email: uniqueEmail(),
    password: "Password123!",
    role: "user",
    isEmailVerified: true,
    ...overrides,
  });

const createPendingUser = async (overrides = {}) =>
  PendingUser.create({
    email: uniqueEmail("pending"),
    otp: TEST_OTP,
    otpExpires: new Date(Date.now() + OTP_EXPIRY_MS),
    username: uniqueUsername("pending"),
    password: "Password123!",
    ...overrides,
  });

const accessTokenFor = (user) => generateAccessToken(user._id);

const createRefreshSession = async (user) => {
  const refreshToken = generateRefreshToken(user._id);
  await Token.create({ userId: user._id, refreshToken });
  return refreshToken;
};

const extractCookieValue = (res, name) => {
  const cookies = res.headers["set-cookie"] || [];
  const prefix = `${name}=`;
  const match = cookies.find((cookie) =>
    cookie.split(";")[0].startsWith(prefix)
  );
  if (!match) return null;

  const raw = match.split(";")[0].slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    return raw;
  }
};

module.exports = {
  createVerifiedUser,
  createPendingUser,
  accessTokenFor,
  createRefreshSession,
  extractCookieValue,
  uniqueEmail,
  uniqueUsername,
};
