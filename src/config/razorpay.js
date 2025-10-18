// Razorpay Payment Gateway Configuration
const Razorpay = require('razorpay');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// ✅ Load environment before configuring Razorpay
const envFile = process.env.NODE_ENV === 'production'
  ? 'production.env'
  : 'development.env';

dotenv.config({ path: path.resolve(__dirname, `${envFile}`) });

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const razorpayConfig = {
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  
  // Webhook secret for signature verification
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  
  // Currency
  currency: process.env.RAZORPAY_CURRENCY || 'INR',
};

// Debug log
console.log('💳 Razorpay Config Check:', {
  env: process.env.NODE_ENV,
  keyId: process.env.RAZORPAY_KEY_ID ? '✅' : '❌ Missing',
  keySecret: process.env.RAZORPAY_KEY_SECRET ? '✅' : '❌ Missing',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ? '✅' : '❌ Missing',
  currency: razorpayConfig.currency,
});

/**
 * Verify Razorpay payment signature
 * @param {string} orderId - Razorpay order ID
 * @param {string} paymentId - Razorpay payment ID
 * @param {string} signature - Razorpay signature
 * @returns {boolean} - True if signature is valid
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const text = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', razorpayConfig.keySecret)
      .update(text)
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
};

/**
 * Verify Razorpay webhook signature
 * @param {string} payload - Webhook payload
 * @param {string} signature - Webhook signature from header
 * @returns {boolean} - True if webhook is authentic
 */
const verifyWebhookSignature = (payload, signature) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', razorpayConfig.webhookSecret)
      .update(payload)
      .digest('hex');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('❌ Webhook verification error:', error);
    return false;
  }
};

module.exports = {
  razorpayInstance,
  razorpayConfig,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
