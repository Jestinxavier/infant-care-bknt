const authService = require("../../services/service");

const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.dashboard_refresh_token || req.cookies?.refresh_token;

    if (!token) {
      return res.status(401).json({ message: "No refresh token provided" });
    }
    const newAccessToken = await authService.refreshAccessToken(token);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ message: err.message });
  }
};

module.exports = refreshToken;
