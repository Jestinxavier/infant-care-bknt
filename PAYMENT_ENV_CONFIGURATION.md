# Payment Gateway Environment Configuration Guide

## 📋 Overview

All payment gateway configurations now automatically load from environment files based on `NODE_ENV`:
- **Development**: `src/config/development.env`
- **Production**: `src/config/production.env`

This matches the pattern used for Cloudinary and other services in your application.

---

## 🔧 Configuration Structure

### Environment Files Location
```
src/config/
├── development.env  ← Development/Testing credentials
└── production.env   ← Production/Live credentials
```

### Automatic Environment Loading
Both payment configurations ([`razorpay.js`](src/config/razorpay.js) and [`phonepe.js`](src/config/phonepe.js)) automatically:
1. Detect `NODE_ENV` (production or development)
2. Load the corresponding `.env` file
3. Validate configuration with debug logs
4. Initialize payment gateway instances

---

## 💳 Razorpay Configuration

### Required Environment Variables

**Development** (`development.env`):
```env
# Razorpay Configuration (Development/Test Mode)
RAZORPAY_KEY_ID=your_dev_razorpay_key_id
RAZORPAY_KEY_SECRET=your_dev_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_dev_webhook_secret
RAZORPAY_CURRENCY=INR
```

**Production** (`production.env`):
```env
# Razorpay Configuration (Production/Live Mode)
RAZORPAY_KEY_ID=your_prod_razorpay_key_id
RAZORPAY_KEY_SECRET=your_prod_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_prod_webhook_secret
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

**Development** (`development.env`):
```env
# PhonePe Configuration (UAT/Sandbox Mode)
PHONEPE_MERCHANT_ID=your_dev_merchant_id
PHONEPE_SALT_KEY=your_dev_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
```

**Production** (`production.env`):
```env
# PhonePe Configuration (Production Mode)
PHONEPE_MERCHANT_ID=your_prod_merchant_id
PHONEPE_SALT_KEY=your_prod_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=https://yourdomain.com/payment/callback
PHONEPE_CALLBACK_URL=https://yourdomain.com/api/v1/payments/phonepe/callback
```

### API Endpoints (Auto-Selected)
- **Development**: `https://api-preprod.phonepe.com/apis/pg-sandbox`
- **Production**: `https://api.phonepe.com/apis/hermes`

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
# Default mode (development)
npm start

# Or explicitly set
NODE_ENV=development npm start
```

### Running in Production Mode
```bash
NODE_ENV=production npm start
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

### Development Setup
- [ ] Add Razorpay test keys to `development.env`
- [ ] Add PhonePe sandbox credentials to `development.env`
- [ ] Update callback URLs to match your local setup
- [ ] Test payment flow with test credentials

### Production Setup
- [ ] Complete KYC for Razorpay (if needed)
- [ ] Complete merchant onboarding for PhonePe
- [ ] Add production keys to `production.env`
- [ ] Update callback URLs to your production domain
- [ ] Set up SSL/HTTPS for production
- [ ] Configure webhooks for both gateways
- [ ] Test in production environment

---

## 🔒 Security Best Practices

1. **Never Commit Production Credentials**
   - Add `*.env` to `.gitignore`
   - Use environment variables in deployment

2. **Environment File Security**
   ```bash
   # Recommended file permissions
   chmod 600 src/config/*.env
   ```

3. **Use Different Credentials**
   - ALWAYS use separate test/live keys
   - Never use production keys in development

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

const envFile = process.env.NODE_ENV === 'production'
  ? 'production.env'
  : 'development.env';

dotenv.config({ path: path.resolve(__dirname, `${envFile}`) });

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

2. **Add to environment files**:
```env
# In development.env
NEWPAYMENT_API_KEY=test_key
NEWPAYMENT_API_SECRET=test_secret

# In production.env
NEWPAYMENT_API_KEY=live_key
NEWPAYMENT_API_SECRET=live_secret
```

---

## 🎉 Benefits of This Setup

✅ **Consistent Configuration** - All services use the same env pattern  
✅ **Easy Environment Switching** - Just change `NODE_ENV`  
✅ **No Hardcoded Values** - All credentials in env files  
✅ **Debug Visibility** - Console logs show what's loaded  
✅ **Secure by Default** - Production and dev credentials separated  
✅ **Easy Deployment** - Works with any hosting platform  

---

**Last Updated**: 2025-10-18  
**Version**: 1.0.0
