const authService = require("../../services/service");

const logout = async (req, res) => {
  try {
    const { token } = req.body;
    await authService.logoutUser(token);
    res.json({ msg: "Logged out successfully" });
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
};

module.exports = logout ;