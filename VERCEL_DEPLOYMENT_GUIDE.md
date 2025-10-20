# 🚀 Vercel Deployment Guide

## Issue: Database Connection Failed on Vercel

You're getting this error because:
1. ❌ Environment variables are not set in Vercel dashboard
2. ❌ Vercel serverless functions need special MongoDB handling
3. ❌ `.env` file is not deployed (it's gitignored)

---

## ✅ Solution: Step-by-Step Fix

### Step 1: Set Environment Variables in Vercel

**CRITICAL**: You must add ALL environment variables to Vercel dashboard!

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add these variables ONE by ONE:

#### Required Variables

```env
# Database
MONGO_URI=mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0

# Server
NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=your_production_jwt_secret_here
JWT_REFRESH_SECRET=your_production_refresh_secret_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=dtwj3t1s2
CLOUDINARY_API_KEY=261842192242146
CLOUDINARY_API_SECRET=CGSlJ7gyweWHHiZLdckWtvaJ2YA

# Email
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=eldhoshaju99@gmail.com
EMAIL_PASSWORD=alhpwaxtsxkgoawb
EMAIL_FROM_NAME=Online Shopping

# Payment Gateways (Update with production credentials)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_CURRENCY=INR

PHONEPE_MERCHANT_ID=your_merchant_id
PHONEPE_SALT_KEY=your_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=https://your-domain.vercel.app/payment/callback
PHONEPE_CALLBACK_URL=https://your-domain.vercel.app/api/v1/payments/phonepe/callback

# URLs (Update with your actual Vercel URL)
FRONTEND_URL=https://your-frontend.vercel.app
BACKEND_URL=https://your-backend.vercel.app
```

#### How to Add in Vercel:

1. **Name**: `MONGO_URI`
2. **Value**: `mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0`
3. **Environment**: Select **Production**, **Preview**, and **Development**
4. Click **Save**

**Repeat for ALL variables above!**

---

### Step 2: Update MongoDB Atlas Network Access

Your MongoDB connection might be blocked by IP restrictions.

1. Go to MongoDB Atlas: https://cloud.mongodb.com/
2. Select your cluster: **Cluster0**
3. Go to **Network Access** (left sidebar)
4. Click **Add IP Address**
5. Choose **"Allow Access from Anywhere"** (0.0.0.0/0)
   - ⚠️ Or add Vercel's IP ranges for better security
6. Click **Confirm**

---

### Step 3: Verify MongoDB Connection String

Make sure your `MONGO_URI` is correct:

```
mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0
```

Check:
- ✅ Username: `Jestinxavier`
- ✅ Password: `wVpHRcBgctcbzr1L`
- ✅ Cluster: `cluster0.5behn.mongodb.net`
- ✅ Database: `onlineshopping`

---

### Step 4: Redeploy on Vercel

After setting environment variables:

**Option 1: Redeploy via Dashboard**
1. Go to your Vercel project
2. Go to **Deployments** tab
3. Click the **⋯** (three dots) on latest deployment
4. Click **Redeploy**

**Option 2: Redeploy via Git**
```bash
git add .
git commit -m "Add Vercel configuration"
git push origin main
```

---

### Step 5: Check Deployment Logs

1. Go to Vercel Dashboard
2. Click on your latest deployment
3. Check **Build Logs** and **Function Logs**
4. Look for:
   - ✅ `✅ MongoDB Connected`
   - ❌ `❌ MongoDB connection failed`

---

### Step 6: Test Health Check

After deployment, test your API:

```bash
# Replace with your actual Vercel URL
curl https://your-app.vercel.app/api/v1/health/database
```

Expected response:
```json
{
  "success": true,
  "status": "connected",
  "database": {
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping"
  },
  "message": "✅ Database is connected and healthy"
}
```

---

## 🔧 Common Issues & Solutions

### Issue 1: "MONGO_URI is not defined"

**Cause**: Environment variables not set in Vercel

**Solution**:
1. Go to Vercel → Settings → Environment Variables
2. Add `MONGO_URI` with your MongoDB connection string
3. Click **Save**
4. Redeploy

---

### Issue 2: "Authentication failed"

**Cause**: Wrong MongoDB credentials

**Solution**:
1. Verify username and password in MongoDB Atlas
2. Update `MONGO_URI` in Vercel environment variables
3. Redeploy

---

### Issue 3: "IP not whitelisted"

**Cause**: Vercel IPs blocked by MongoDB

**Solution**:
1. MongoDB Atlas → Network Access
2. Add IP: `0.0.0.0/0` (Allow all)
3. Wait 1-2 minutes for changes to apply

---

### Issue 4: "Connection timeout"

**Cause**: Network issues or wrong cluster address

**Solution**:
1. Verify cluster address in MongoDB Atlas
2. Check MongoDB cluster is running
3. Try pinging: `https://cluster0.5behn.mongodb.net`

---

## 📋 Vercel Environment Variables Checklist

Copy this checklist when adding variables to Vercel:

- [ ] `MONGO_URI`
- [ ] `NODE_ENV`
- [ ] `PORT`
- [ ] `JWT_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`
- [ ] `EMAIL_SERVICE`
- [ ] `EMAIL_HOST`
- [ ] `EMAIL_PORT`
- [ ] `EMAIL_SECURE`
- [ ] `EMAIL_USER`
- [ ] `EMAIL_PASSWORD`
- [ ] `EMAIL_FROM_NAME`
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `RAZORPAY_CURRENCY`
- [ ] `PHONEPE_MERCHANT_ID`
- [ ] `PHONEPE_SALT_KEY`
- [ ] `PHONEPE_SALT_INDEX`
- [ ] `PHONEPE_REDIRECT_URL`
- [ ] `PHONEPE_CALLBACK_URL`
- [ ] `FRONTEND_URL`
- [ ] `BACKEND_URL`

---

## 🎯 Quick Fix Commands

### 1. Test MongoDB Connection Locally

```bash
# Test if MongoDB is accessible
mongosh "mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping"
```

### 2. Check Vercel Logs

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# View logs
vercel logs
```

### 3. Test Health Endpoint

```bash
# Replace with your Vercel URL
curl https://your-app.vercel.app/api/v1/health/status
```

---

## 🔒 Security Recommendations

### For Production:

1. **Use Different JWT Secrets**
   ```env
   # Generate strong secrets
   JWT_SECRET=$(openssl rand -base64 32)
   JWT_REFRESH_SECRET=$(openssl rand -base64 32)
   ```

2. **Restrict MongoDB IP Access**
   - Don't use `0.0.0.0/0` in production
   - Add specific Vercel IP ranges

3. **Use Production Payment Credentials**
   - Update Razorpay to live keys
   - Update PhonePe to production credentials

4. **Update Callback URLs**
   - Change from localhost to your Vercel domain
   - Example: `https://your-app.vercel.app/api/v1/payments/callback`

---

## 📊 Monitoring

After deployment, monitor your app:

1. **Vercel Analytics**
   - Go to Vercel Dashboard → Analytics
   - Monitor response times and errors

2. **Health Check Endpoint**
   ```bash
   # Set up monitoring (every 5 minutes)
   curl https://your-app.vercel.app/api/v1/health/status
   ```

3. **MongoDB Metrics**
   - MongoDB Atlas → Metrics
   - Check connection count and query performance

---

## 🆘 Still Not Working?

### Debug Steps:

1. **Check Vercel Function Logs**
   - Vercel Dashboard → Your Project → Functions
   - Click on a function to see logs

2. **Verify Environment Variables**
   ```bash
   # In Vercel dashboard, go to Settings → Environment Variables
   # Make sure all variables are set
   ```

3. **Test Locally First**
   ```bash
   # Make sure it works locally
   npm run dev
   
   # Test health endpoint
   curl http://localhost:3000/api/v1/health/database
   ```

4. **Check MongoDB Atlas Status**
   - https://status.mongodb.com/
   - Verify no outages

---

## 📞 Need Help?

If you're still having issues:

1. **Check Vercel deployment logs** for specific error messages
2. **Test MongoDB connection** using MongoDB Compass or mongosh
3. **Verify all environment variables** are correctly set in Vercel
4. **Ensure MongoDB Atlas** allows connections from anywhere (0.0.0.0/0)

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ `/api/v1/health/database` returns `"success": true`
2. ✅ Vercel logs show: `✅ MongoDB Connected`
3. ✅ No `readyState: 0` in health check response
4. ✅ API endpoints respond correctly

---

**Created**: 2025-10-20  
**Last Updated**: 2025-10-20  
**Version**: 1.0.0
