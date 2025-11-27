const authService = require("../../services/service");

const login = async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await authService.loginUser(req.body);
    
    // Set refresh token as HttpOnly cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      sameSite: "Strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.json({ 
      message: "Login successful", 
      accessToken, 
      // Don't send refreshToken in response body for security
      // It's now in HttpOnly cookie
      user // Include user info in response
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

module.exports = login;
