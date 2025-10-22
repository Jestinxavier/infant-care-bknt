const authService = require("../../services/service");

/**
 * Step 1: Request OTP for registration
 */
const requestOTP = async (req, res) => {
  try {
    console.log('📧 Request OTP called with:', req.body);
    
    // Validate email exists
    if (!req.body.email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    const result = await authService.requestOTP(req.body);
    console.log('✅ OTP request successful for:', req.body.email);
    res.status(200).json(result);
  } catch (err) {
    console.error('❌ OTP request failed:', err.message);
    console.error('🐞 Full error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * Step 2: Verify OTP and complete registration
 */
const verifyOTP = async (req, res) => {
  try {
    const result = await authService.verifyOTPAndRegister(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = { requestOTP, verifyOTP };
