const authService = require("../../services/service");
const logger = require("../../utils/logger");
const { ADMIN_ROLES } = require("../../../resources/constants");
const {
  getAuthCookieName,
  getRequestClientType,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

const login = async (req, res) => {
  try {
    const clientType = getRequestClientType(req);
    const { accessToken, refreshToken, user } = await authService.loginUser(
      req.body
    );

    if (clientType === "dashboard" && !ADMIN_ROLES.includes(user.role)) {
      await authService.logoutUser(refreshToken);
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin role required.",
      });
    }

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
