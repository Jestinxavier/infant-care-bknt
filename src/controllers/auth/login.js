const authService = require("../../services/service");

const login = async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await authService.loginUser(req.body);
    res.json({ 
      message: "Login successful", 
      accessToken, 
      refreshToken,
      user // Include user info in response
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = login;
