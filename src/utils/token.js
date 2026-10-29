const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { TOKEN_EXPIRY } = require("../../resources/constants");

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN,
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: TOKEN_EXPIRY.REFRESH_TOKEN,
    jwtid: crypto.randomBytes(16).toString("hex"),
  });
};

module.exports = { generateAccessToken, generateRefreshToken };
