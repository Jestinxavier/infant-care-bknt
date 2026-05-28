const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieName,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

const login = async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await authService.loginUser(
      req.body
    );

    const clientType = req.headers["x-client-type"] === "dashboard" ? "dashboard" : "frontend";
    res.cookie(getAuthCookieName(clientType, "access"), accessToken, getAuthCookieOptions());
    res.cookie(getAuthCookieName(clientType, "refresh"), refreshToken, getRefreshCookieOptions());

    res.json({
      success: true,
      message: "Login successful",
      user,
    });
  } catch (err) {
    logger.error("❌ Login error:", err.message);
    const status = err.message === "Invalid credentials" ? 401 : 400;
    res.status(status).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = login;
