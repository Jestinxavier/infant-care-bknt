const authService = require("../../services/service");

/**
 * Step 1: Request OTP for registration
 */
const requestOTP = async (req, res) => {
  try {
    const result = await authService.requestOTP(req.body);
    res.status(200).json(result);
  } catch (err) {
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
