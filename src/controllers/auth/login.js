const authService = require("../../services/service");

const login = async (req, res) => {
  try {
    // Note: Platform header checks removed - admin access controlled by route prefix
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
      success: true,
      message: "Login successful", 
      accessToken,
      refreshToken, // Include refreshToken in response for client-side storage
      user // Include user info in response
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(400).json({ 
      success: false,
      message: err.message 
    });
  }
};

module.exports = login;
