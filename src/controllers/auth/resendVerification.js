const authService = require("../../services/service");

/**
 * Resend OTP
 */
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }

    const result = await authService.resendOTP(email);
    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Resend OTP error:", err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

module.exports = resendOTP;
