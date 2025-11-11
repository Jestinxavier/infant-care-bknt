const login = require("./login");
const { requestOTP, verifyOTP } = require("./register");
const refreshToken = require("./refreshToken");
const logout = require("./logout");
const resendOTP = require("./resendVerification");
const getProfile = require("./getProfile");
const updateProfile = require("./updateProfile");
const checkUserExists = require("./checkUserExists");
const { requestLoginOTP, verifyLoginOTP } = require("./loginWithOTP");

module.exports = {
  login,
  requestOTP,
  verifyOTP,
  refreshToken,
  logout,
  resendOTP,
  getProfile,
  updateProfile,
  checkUserExists,
  requestLoginOTP,
  verifyLoginOTP,
};
