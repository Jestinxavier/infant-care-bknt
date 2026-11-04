const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieName,
  getRequestClientType,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

const refreshToken = async (req, res) => {
  try {
    const clientType = getRequestClientType(req);
    const allCookies = req.cookies || {};

    // Debug only: runs on every storefront page load, and visitors' cookie
    // names don't belong in production logs.
    logger.debug(`🔄 Refresh token request from: ${clientType}`);
    logger.debug("🍪 Available cookies:", Object.keys(allCookies));

    const token = allCookies[getAuthCookieName(clientType, "refresh")];

    if (!token) {
      logger.debug(`No refresh token found for ${clientType}`);
      return res.status(401).json({
        message: "No refresh token provided",
      });
    }

    logger.debug(`✅ Refresh token found for ${clientType}, refreshing...`);
    const { accessToken: newAccessToken, refreshToken: nextRefreshToken } =
      await authService.refreshAccessToken(token);

    res.cookie(
      getAuthCookieName(clientType, "access"),
      newAccessToken,
      getAuthCookieOptions(),
    );
    res.cookie(
      getAuthCookieName(clientType, "refresh"),
      nextRefreshToken,
      getRefreshCookieOptions(),
    );

    res.json({
      success: true,
    });
  } catch (err) {
    logger.error("❌ Refresh token error:", err.message);
    res.status(403).json({ message: err.message });
  }
};

module.exports = refreshToken;
