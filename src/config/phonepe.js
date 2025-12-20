// PhonePe Payment Gateway Configuration (V1 Legacy API)
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// ✅ Load environment from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const SALT_KEY = process.env.PHONEPE_SALT_KEY;
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';

// V1 API Endpoints
const PHONEPE_ENV = process.env.PHONEPE_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

const BASE_URL = PHONEPE_ENV === 'production'
  ? 'https://api.phonepe.com/apis/hermes'
  : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

const phonePeConfig = {
  merchantId: MERCHANT_ID,
  saltKey: SALT_KEY,
  saltIndex: parseInt(SALT_INDEX),
  redirectUrl: process.env.PHONEPE_REDIRECT_URL,
  callbackUrl: process.env.PHONEPE_CALLBACK_URL,
  baseUrl: BASE_URL,
  endpoints: {
    pay: '/pg/v1/pay',
    status: '/pg/v1/status',
    refund: '/pg/v1/refund'
  }
};

// Debug log (Safe - no secrets)
console.log('📱 PhonePe V1 (Manual) Configured:', {
  env: PHONEPE_ENV.toUpperCase(),
  merchantId: MERCHANT_ID ? '✅' : '❌ Missing',
  saltKey: SALT_KEY ? `${SALT_KEY.substring(0, 4)}...${SALT_KEY.substring(SALT_KEY.length - 4)}` : '❌ Missing',
  saltIndex: SALT_INDEX,
  baseUrl: BASE_URL
});

/**
 * Generate X-VERIFY header for PhonePe V1 API
 * @param {string} base64Payload 
 * @param {string} endpoint 
 * @returns {string}
 */
const generateXVerify = (base64Payload, endpoint) => {
  const string = base64Payload + endpoint + SALT_KEY;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  return `${sha256}###${SALT_INDEX}`;
};

/**
 * Verify Checksum from PhonePe Callback
 * @param {string} receivedXVerify 
 * @param {string} base64Response 
 * @returns {boolean}
 */
const verifyCallbackChecksum = (receivedXVerify, base64Response) => {
  const string = base64Response + SALT_KEY;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  const expectedXVerify = `${sha256}###${SALT_INDEX}`;
  return receivedXVerify === expectedXVerify;
};

module.exports = {
  phonePeConfig,
  generateXVerify,
  verifyCallbackChecksum
};
