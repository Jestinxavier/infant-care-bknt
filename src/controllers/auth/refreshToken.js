const authService = require("../../services/service");
const { ACCESS_TOKEN_LIFETIME_MS } = require("../../../resources/constants");

const refreshToken = async (req, res) => {
  try {
    // Identify client type from header
    const clientType = req.headers["x-client-type"] || "unknown";

    // Collect all cookies from the request
    const allCookies = req.cookies || {};

    console.log(`🔄 Refresh token request from: ${clientType}`);
    console.log("🍪 Available cookies:", Object.keys(allCookies));

    // Get the appropriate refresh token based on client type
    let token;
    if (clientType === "dashboard") {
      token = allCookies.dashboard_refresh_token;
    } else if (clientType === "frontend") {
      token = allCookies.refresh_token;
    } else {
      // Fallback: try both cookies
      token = allCookies.dashboard_refresh_token || allCookies.refresh_token;
    }

    // Also accept from body as fallback
    if (!token) {
      token = req.body?.refreshToken;
    }

    if (!token) {
      console.log(`❌ No refresh token found for ${clientType}`);
      return res.status(401).json({
        message: "No refresh token provided",
        clientType,
        availableCookies: Object.keys(allCookies),
      });
    }

    console.log(`✅ Refresh token found for ${clientType}, refreshing...`);
    const newAccessToken = await authService.refreshAccessToken(token);

    res.json({
      accessToken: newAccessToken,
      accessTokenLifetimeMs: ACCESS_TOKEN_LIFETIME_MS,
      clientType,
    });
  } catch (err) {
    console.error("❌ Refresh token error:", err.message);
    res.status(403).json({ message: err.message });
  }
};

module.exports = refreshToken;
