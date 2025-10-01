const authService = require("../../services/service");

const refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    const newAccessToken = await authService.refreshAccessToken(token);
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ msg: err.message });
  }
};

module.exports = refreshToken ;