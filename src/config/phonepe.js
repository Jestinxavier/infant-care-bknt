// PhonePe Payment Gateway Configuration
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// ✅ Load environment from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const phonePeConfig = {
  // Get these from PhonePe Merchant Dashboard
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX || '1',
  
  // API Endpoints
  apiEndpoint: process.env.NODE_ENV === 'production' 
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  
  // Redirect URLs
  redirectUrl: process.env.PHONEPE_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL,
};

// Debug log
console.log('📱 PhonePe Config Check:', {
  env: process.env.NODE_ENV,
  merchantId: process.env.PHONEPE_MERCHANT_ID ? '✅' : '❌ Missing',
  saltKey: process.env.PHONEPE_SALT_KEY ? '✅' : '❌ Missing',
  saltIndex: phonePeConfig.saltIndex,
  apiEndpoint: phonePeConfig.apiEndpoint,
  redirectUrl: process.env.PHONEPE_REDIRECT_URL ? '✅' : '❌ Missing',
  callbackUrl: process.env.PHONEPE_CALLBACK_URL ? '✅' : '❌ Missing',
});

/**
 * Generate checksum for PhonePe API requests
 * @param {string} payload - Base64 encoded payload
 * @returns {string} - SHA256 checksum
 */
const generateChecksum = (payload) => {
  const string = payload + '/pg/v1/pay' + phonePeConfig.saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return sha256 + '###' + phonePeConfig.saltIndex;
};

/**
 * Verify checksum from PhonePe callback
 * @param {string} receivedChecksum - Checksum from PhonePe
 * @param {string} payload - Response payload
 * @returns {boolean} - True if checksum is valid
 */
const verifyChecksum = (receivedChecksum, payload) => {
  const string = payload + phonePeConfig.saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  const expectedChecksum = sha256 + '###' + phonePeConfig.saltIndex;
  return receivedChecksum === expectedChecksum;
};

module.exports = {
  phonePeConfig,
  generateChecksum,
  verifyChecksum
};
