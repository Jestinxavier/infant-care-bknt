const login = require("./login");
const { requestOTP, verifyOTP } = require("./register");
const refreshToken = require("./refreshToken");
const logout = require("./logout");
const resendOTP = require("./resendVerification");
const getProfile = require("./getProfile");

module.exports = {
  login,
  requestOTP,
  verifyOTP,
  refreshToken,
  logout,
  resendOTP,
  getProfile,
};
