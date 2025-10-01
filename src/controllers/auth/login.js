const authService = require("../../services/service");

const login = async (req, res) => {
  try {
    const { accessToken, refreshToken } = await authService.loginUser(req.body);
    res.json({ msg: "Login successful", accessToken, refreshToken });
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
};

module.exports = login ;