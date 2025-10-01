const authService = require("../../services/service");

const register = async (req, res) => {
  try {
    const user = await authService.registerUser(req.body);
    res.status(201).json({ msg: "User registered", user });
  } catch (err) {
    res.status(400).json({ msg: err.message });
  }
};

module.exports = register ;