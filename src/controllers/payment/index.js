const {
  initPhonePePayment,
  phonePeCallback,
  checkPaymentStatus,
  initiatePhonePeRefund,
  getPhonePeRefundStatus
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
  initiatePhonePeRefund,
  getPhonePeRefundStatus,

  // Razorpay
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  getPaymentDetails,
};
