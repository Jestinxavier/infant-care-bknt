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
  });
};

module.exports = { generateAccessToken, generateRefreshToken };
