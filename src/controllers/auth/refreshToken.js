const authService = require("../../services/service");
const logger = require("../../utils/logger");
const {
  getAuthCookieName,
  getAuthCookieOptions,
  getRefreshCookieOptions,
} = require("../../utils/authCookieOptions");

const refreshToken = async (req, res) => {
  try {
    const clientType = req.headers["x-client-type"] || "unknown";
    const allCookies = req.cookies || {};

    logger.info(`🔄 Refresh token request from: ${clientType}`);
    logger.info("🍪 Available cookies:", Object.keys(allCookies));

    let token;
    if (clientType === "dashboard") {
      token = allCookies.dashboard_refresh_token;
    } else if (clientType === "frontend") {
      token = allCookies.refresh_token;
    } else {
      // Fallback: try both cookies
      token = allCookies.dashboard_refresh_token || allCookies.refresh_token;
    }

    if (!token) {
      token =
        allCookies.refresh_token ||
        allCookies.dashboard_refresh_token ||
        req.body?.refreshToken;
    }

    if (!token) {
      logger.info(`❌ No refresh token found for ${clientType}`);
      return res.status(401).json({
        message: "No refresh token provided",
      });
    }

    logger.info(`✅ Refresh token found for ${clientType}, refreshing...`);
    const { accessToken: newAccessToken, refreshToken: nextRefreshToken } =
      await authService.refreshAccessToken(token);

    const cookieClientType = clientType === "dashboard" ? "dashboard" : "frontend";
    res.cookie(
      getAuthCookieName(cookieClientType, "access"),
      newAccessToken,
      getAuthCookieOptions(),
    );
    res.cookie(
      getAuthCookieName(cookieClientType, "refresh"),
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
