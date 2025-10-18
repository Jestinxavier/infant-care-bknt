const { 
  initPhonePePayment, 
  phonePeCallback, 
  checkPaymentStatus 
} = require('./phonePeController');

const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  getPaymentDetails
} = require('./razorpayController');

module.exports = {
  // PhonePe
  initPhonePePayment,
  phonePeCallback,
  checkPaymentStatus,
  
  // Razorpay
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  getPaymentDetails,
};
