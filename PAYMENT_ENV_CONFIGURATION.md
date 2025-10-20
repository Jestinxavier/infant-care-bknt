# Payment Gateway Environment Configuration Guide

# 🔐 Payment Gateway Environment Configuration

## 📋 Overview

All payment gateway configurations now load from a single `.env` file in the project root.
This simplifies environment management and follows a standard configuration pattern.

---

## 🔧 Configuration Structure

### Environment File Location
```
.env  ← Single environment file in project root
```

### Automatic Environment Loading
Both payment configurations ([`razorpay.js`](src/config/razorpay.js) and [`phonepe.js`](src/config/phonepe.js)) automatically:
1. Load variables from `.env` file
2. Validate configuration with debug logs
3. Initialize payment gateway instances

---

## 💳 Razorpay Configuration

### Required Environment Variables

Add to `.env` in project root:
```env
# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_CURRENCY=INR
```

### Getting Razorpay Credentials

1. **Login to Razorpay Dashboard**: https://dashboard.razorpay.com/
2. **Test Mode Keys** (Development):
   - Go to Settings → API Keys
   - Toggle to "Test Mode"
   - Generate Test Keys
3. **Live Mode Keys** (Production):
   - Complete KYC verification
   - Go to Settings → API Keys
   - Toggle to "Live Mode"
   - Generate Live Keys
4. **Webhook Secret**:
   - Go to Settings → Webhooks
   - Create webhook endpoint
   - Copy the webhook secret

---

## 📱 PhonePe Configuration

### Required Environment Variables

Add to `.env` in project root:
```env
# PhonePe Configuration
PHONEPE_MERCHANT_ID=your_merchant_id
PHONEPE_SALT_KEY=your_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
NODE_ENV=development
```

### API Endpoints
- **Development** (NODE_ENV=development): `https://api-preprod.phonepe.com/apis/pg-sandbox`
- **Production** (NODE_ENV=production): `https://api.phonepe.com/apis/hermes`

### Getting PhonePe Credentials

1. **UAT/Sandbox** (Development):
   - Visit: https://business.phonepe.com/
   - Register for UAT access
   - Get sandbox Merchant ID and Salt Key
2. **Production**:
   - Complete merchant onboarding
   - Get production credentials from merchant dashboard

---

## 🚀 How to Switch Environments

### Running in Development Mode
```bash
# Set NODE_ENV in .env file
NODE_ENV=development

# Then start server
npm start
```

### Running in Production Mode
```bash
# Update NODE_ENV in .env file
NODE_ENV=production

# Then start server
npm start
```

### What Happens Automatically

When you start the server, you'll see debug logs:
```
💳 Razorpay Config Check: {
  env: 'development',
  keyId: '✅',
  keySecret: '✅',
  webhookSecret: '✅',
  currency: 'INR'
}

📱 PhonePe Config Check: {
  env: 'development',
  merchantId: '✅',
  saltKey: '✅',
  saltIndex: '1',
  apiEndpoint: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  redirectUrl: '✅',
  callbackUrl: '✅'
}
```

---

## ✅ Setup Checklist

### Initial Setup
- [ ] Create `.env` file in project root
- [ ] Add all required environment variables
- [ ] Set `NODE_ENV=development` for testing
- [ ] Add Razorpay test keys to `.env`
- [ ] Add PhonePe sandbox credentials to `.env`
- [ ] Update callback URLs to match your setup
- [ ] Test payment flow with test credentials

### Production Deployment
- [ ] Update `NODE_ENV=production` in `.env`
- [ ] Replace with production credentials
- [ ] Update callback URLs to production domain
- [ ] Ensure SSL/HTTPS is configured
- [ ] Configure webhooks for both gateways
- [ ] Test in production environment

---

## 🔒 Security Best Practices

1. **Never Commit .env File**
   - Add `.env` to `.gitignore`
   - Use environment variables in deployment
   - Never share credentials publicly

2. **Environment File Security**
   ```bash
   # Recommended file permissions
   chmod 600 .env
   ```

3. **Use Different Credentials**
   - Use test keys when NODE_ENV=development
   - Use live keys when NODE_ENV=production
   - Keep credentials separate and secure

4. **Webhook Security**
   - Always verify signatures
   - Use HTTPS endpoints in production

---

## 🐛 Troubleshooting

### Missing Configuration Errors

If you see `❌ Missing` in console:
1. Check the environment file exists
2. Verify variable names match exactly
3. Ensure no extra spaces in values
4. Restart the server after changes

### Wrong Environment Loading

```bash
# Check which env file is loaded
cat src/config/development.env  # Should have your current config
echo $NODE_ENV  # Should match your intention
```

### Payment Gateway Errors

1. **Razorpay "Invalid Key"**
   - Verify you're using the correct mode (test/live)
   - Check key format (starts with `rzp_test_` or `rzp_live_`)

2. **PhonePe "Checksum Failed"**
   - Verify salt key matches environment
   - Check salt index is correct
   - Ensure payload encoding is correct

---

## 📖 Related Documentation

- [`RAZORPAY_INTEGRATION.md`](RAZORPAY_INTEGRATION.md) - Razorpay implementation guide
- [`PHONEPE_INTEGRATION.md`](PHONEPE_INTEGRATION.md) - PhonePe implementation guide
- [`PHONEPE_CREDENTIALS_GUIDE.md`](PHONEPE_CREDENTIALS_GUIDE.md) - How to get PhonePe credentials
- [`PHONEPE_TESTING_GUIDE.md`](PHONEPE_TESTING_GUIDE.md) - Testing PhonePe integration

---

## 💡 Example: Adding New Payment Gateway

To add a new payment gateway following the same pattern:

1. **Create config file**: `src/config/newpayment.js`
```javascript
const dotenv = require('dotenv');
const path = require('path');

// Load from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const newPaymentConfig = {
  apiKey: process.env.NEWPAYMENT_API_KEY,
  apiSecret: process.env.NEWPAYMENT_API_SECRET,
};

console.log('🎯 NewPayment Config Check:', {
  env: process.env.NODE_ENV,
  apiKey: process.env.NEWPAYMENT_API_KEY ? '✅' : '❌ Missing',
  apiSecret: process.env.NEWPAYMENT_API_SECRET ? '✅' : '❌ Missing',
});

module.exports = { newPaymentConfig };
```

2. **Add to .env file**:
```env
# New Payment Gateway
NEWPAYMENT_API_KEY=your_api_key
NEWPAYMENT_API_SECRET=your_api_secret
```

---

## 🎉 Benefits of This Setup

✅ **Simple Configuration** - Single `.env` file for all settings  
✅ **Easy Environment Switching** - Just update `NODE_ENV` in `.env`  
✅ **No Hardcoded Values** - All credentials in one place  
✅ **Debug Visibility** - Console logs show what's loaded  
✅ **Secure by Default** - Centralized credential management  
✅ **Easy Deployment** - Works with any hosting platform  

---

**Last Updated**: 2025-10-20  
**Version**: 2.0.0
