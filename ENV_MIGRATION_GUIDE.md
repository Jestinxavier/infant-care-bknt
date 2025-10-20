# 🔄 Environment Configuration Migration Guide

## What Changed?

The application has been updated to use a **single `.env` file** in the project root instead of separate `development.env` and `production.env` files in the config directory.

---

## 📦 Migration Steps

### 1. Create Root `.env` File

Copy the `.env.example` to create your `.env` file:

```bash
cp .env.example .env
```

### 2. Migrate Existing Configuration

If you have existing `src/config/development.env` or `src/config/production.env` files:

**Option A: For Development**
```bash
# Copy your development environment variables
cp src/config/development.env .env
```

**Option B: For Production**
```bash
# Copy your production environment variables
cp src/config/production.env .env
```

**Option C: Manual Migration**
1. Open your existing `src/config/development.env` or `production.env`
2. Copy all variables to the new `.env` file in project root
3. Make sure `NODE_ENV=development` or `NODE_ENV=production` is set

### 3. Update Your `.env` File

Open `.env` and fill in all required values:

```env
# Server
PORT=3000
NODE_ENV=development  # or 'production'

# Database
MONGO_URI=mongodb://localhost:27017/online-shopping

# JWT
JWT_ACCESS_SECRET=your_jwt_access_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_CURRENCY=INR

# PhonePe
PHONEPE_MERCHANT_ID=your_merchant_id
PHONEPE_SALT_KEY=your_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
```

### 4. Clean Up Old Files (Optional)

After migrating, you can safely delete the old environment files:

```bash
rm src/config/development.env
rm src/config/production.env
```

⚠️ **Important**: Make sure you've copied all variables before deleting!

---

## 🔧 Configuration Changes Summary

### Files Updated

1. **`src/server.js`** - Now loads from `/.env`
2. **`src/config/razorpay.js`** - Now loads from `/.env`
3. **`src/config/phonepe.js`** - Now loads from `/.env`
4. **`src/config/cloudinary.js`** - Now loads from `/.env`

### Old Approach (❌ Removed)
```javascript
const envFile = process.env.NODE_ENV === 'production'
  ? 'production.env'
  : 'development.env';

dotenv.config({ path: path.resolve(__dirname, `./config/${envFile}`) });
```

### New Approach (✅ Current)
```javascript
// Load from root .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });
```

---

## 🎯 Benefits of New Approach

✅ **Simpler Structure** - Single `.env` file instead of multiple environment files  
✅ **Standard Practice** - Follows Node.js convention of root `.env` file  
✅ **Easier Deployment** - Most platforms expect `.env` in project root  
✅ **Less Confusion** - One source of truth for all environment variables  
✅ **Better IDE Support** - Most editors auto-detect root `.env` files  

---

## 🚀 Running the Application

### Development Mode
```bash
# In .env file, set:
NODE_ENV=development

# Then run:
npm run dev
```

### Production Mode
```bash
# In .env file, set:
NODE_ENV=production

# Then run:
npm start
```

---

## 🔒 Security Reminders

1. ✅ `.env` file is now in `.gitignore`
2. ✅ Never commit `.env` to version control
3. ✅ Use `.env.example` as a template for team members
4. ✅ Keep development and production credentials separate
5. ✅ Use test mode credentials when `NODE_ENV=development`
6. ✅ Use live mode credentials when `NODE_ENV=production`

---

## ❓ Troubleshooting

### Error: "Missing environment variables"

**Solution**: Make sure your `.env` file exists in the project root and contains all required variables.

```bash
# Check if .env exists
ls -la .env

# If not, create from example
cp .env.example .env
```

### Error: "MONGO_URI is missing"

**Solution**: Open `.env` and add your MongoDB connection string:

```env
MONGO_URI=mongodb://localhost:27017/online-shopping
```

### Payment Gateway Not Working

**Solution**: Verify you have the correct credentials for your environment:

- **Development**: Use test/sandbox credentials
- **Production**: Use live/production credentials

---

## 📚 Related Documentation

- [PAYMENT_ENV_CONFIGURATION.md](PAYMENT_ENV_CONFIGURATION.md) - Updated payment gateway configuration guide
- [README.md](readme.md) - Main project documentation
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide

---

**Migration Date**: 2025-10-20  
**Version**: 2.0.0  
**Breaking Change**: Yes - Requires environment file migration
