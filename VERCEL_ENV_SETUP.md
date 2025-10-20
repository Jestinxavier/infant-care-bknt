# 🎯 How to Add Environment Variables in Vercel (Step-by-Step)

## The Problem

Your database is disconnected on Vercel because environment variables from your local `.env` file are **NOT automatically uploaded** to Vercel.

```json
{
  "database": {
    "status": "disconnected",  // ❌ This means no MONGO_URI
    "readyState": 0
  }
}
```

---

## The Solution: Add Variables Manually

### Step 1: Open Vercel Dashboard

1. Go to: https://vercel.com/dashboard
2. Click on your project name
3. You'll see: Overview, Deployments, Settings, etc.

---

### Step 2: Navigate to Environment Variables

1. Click **"Settings"** tab (top menu)
2. Scroll down left sidebar
3. Click **"Environment Variables"**

---

### Step 3: Add Each Variable

For EACH variable in your `.env` file:

#### Example: Adding MONGO_URI

**Field 1 - Name:**
```
MONGO_URI
```

**Field 2 - Value:**
```
mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0
```

**Field 3 - Environment:**
- ✅ Check **Production**
- ✅ Check **Preview**
- ✅ Check **Development**

**Click**: `Add` or `Save`

---

### Step 4: Repeat for ALL Variables

Add these variables ONE by ONE:

```env
# 1. Database
MONGO_URI=mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0

# 2. Environment
NODE_ENV=production

# 3. JWT
JWT_SECRET=your_production_secret_here
JWT_REFRESH_SECRET=your_production_refresh_secret_here

# 4. Cloudinary
CLOUDINARY_CLOUD_NAME=dtwj3t1s2
CLOUDINARY_API_KEY=261842192242146
CLOUDINARY_API_SECRET=CGSlJ7gyweWHHiZLdckWtvaJ2YA

# 5. Email
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=eldhoshaju99@gmail.com
EMAIL_PASSWORD=alhpwaxtsxkgoawb
EMAIL_FROM_NAME=Online Shopping

# 6. Payment Gateways (update with production keys)
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_CURRENCY=INR

PHONEPE_MERCHANT_ID=your_merchant_id
PHONEPE_SALT_KEY=your_salt_key
PHONEPE_SALT_INDEX=1
PHONEPE_REDIRECT_URL=https://your-app.vercel.app/payment/callback
PHONEPE_CALLBACK_URL=https://your-app.vercel.app/api/v1/payments/phonepe/callback

# 7. URLs (update with your Vercel domain)
FRONTEND_URL=https://your-frontend.vercel.app
BACKEND_URL=https://your-backend.vercel.app
```

⚠️ **IMPORTANT**: Copy values from your local `.env` file!

---

### Step 5: Verify Variables Are Added

After adding all variables, you should see a list like:

```
✅ MONGO_URI               Production, Preview, Development
✅ NODE_ENV                Production, Preview, Development
✅ JWT_SECRET              Production, Preview, Development
✅ JWT_REFRESH_SECRET      Production, Preview, Development
✅ CLOUDINARY_CLOUD_NAME   Production, Preview, Development
... (and so on)
```

---

### Step 6: Redeploy

After adding all variables:

**Option A: Via Vercel Dashboard**
1. Go to **"Deployments"** tab
2. Click **"..."** (three dots) on latest deployment
3. Click **"Redeploy"**
4. Check **"Use existing build cache"** = NO
5. Click **"Redeploy"**

**Option B: Via Git Push**
```bash
# Make a small change
git commit --allow-empty -m "Trigger redeploy"
git push origin main
```

---

## 🧪 Test After Deployment

### Test Health Endpoint

Replace `YOUR_APP_URL` with your actual Vercel URL:

```bash
curl https://YOUR_APP_URL.vercel.app/api/v1/health/database
```

### Expected Response (Success):

```json
{
  "success": true,
  "status": "connected",
  "database": {
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping",
    "port": 27017
  },
  "message": "✅ Database is connected and healthy"
}
```

### If Still Disconnected:

```json
{
  "success": false,
  "status": "disconnected",
  "readyState": 0
}
```

**Possible causes:**
1. ❌ MONGO_URI not set correctly
2. ❌ MongoDB Atlas IP not whitelisted
3. ❌ Variables not applied (redeploy needed)

---

## 🔐 MongoDB Atlas IP Whitelist

### Allow Vercel to Connect

1. Go to: https://cloud.mongodb.com/
2. Select your project and cluster
3. Click **"Network Access"** (left sidebar)
4. Click **"Add IP Address"**
5. Select **"Allow Access from Anywhere"**
   - IP Address: `0.0.0.0/0`
6. Click **"Confirm"**

**Wait 1-2 minutes** for changes to apply.

---

## 📊 Variable Checklist

Use this checklist when adding variables:

### Essential (Required)
- [ ] `MONGO_URI` ← Most important!
- [ ] `NODE_ENV`
- [ ] `JWT_SECRET`
- [ ] `JWT_REFRESH_SECRET`

### Cloudinary (Required for image upload)
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`

### Email (Required for OTP)
- [ ] `EMAIL_SERVICE`
- [ ] `EMAIL_HOST`
- [ ] `EMAIL_PORT`
- [ ] `EMAIL_SECURE`
- [ ] `EMAIL_USER`
- [ ] `EMAIL_PASSWORD`
- [ ] `EMAIL_FROM_NAME`

### Payment Gateways (Optional for now)
- [ ] `RAZORPAY_KEY_ID`
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `RAZORPAY_CURRENCY`
- [ ] `PHONEPE_MERCHANT_ID`
- [ ] `PHONEPE_SALT_KEY`
- [ ] `PHONEPE_SALT_INDEX`
- [ ] `PHONEPE_REDIRECT_URL`
- [ ] `PHONEPE_CALLBACK_URL`

### URLs
- [ ] `FRONTEND_URL`
- [ ] `BACKEND_URL`

---

## 🎬 Quick Video Guide

### Using Vercel CLI (Alternative Method)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Add environment variables from .env file
vercel env pull

# Or add manually
vercel env add MONGO_URI production
# Paste your MongoDB URI when prompted

# Add all other variables
vercel env add NODE_ENV production
vercel env add JWT_SECRET production
# ... continue for all variables
```

---

## 🔍 Troubleshooting

### Issue: Variables not showing in Vercel

**Solution**: Refresh the page, sometimes it takes a few seconds

---

### Issue: Deployment still fails after adding variables

**Solution**:
1. Clear build cache
2. Redeploy without cache
3. Check function logs in Vercel dashboard

---

### Issue: "MONGO_URI is not defined" in logs

**Solution**:
1. Double-check variable name is exactly `MONGO_URI` (case-sensitive)
2. Ensure it's added to **Production** environment
3. Redeploy after adding

---

## ✅ Success Indicators

You'll know it worked when:

1. ✅ Health endpoint shows `"success": true`
2. ✅ Database shows `"status": "connected"`
3. ✅ `readyState` is `1` (not 0)
4. ✅ No errors in Vercel function logs
5. ✅ API endpoints respond correctly

---

## 📚 Additional Resources

- [Vercel Environment Variables Docs](https://vercel.com/docs/environment-variables)
- [MongoDB Atlas IP Whitelist](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions)

---

**Need More Help?**

Check the deployment logs:
1. Vercel Dashboard → Your Project
2. Click on latest deployment
3. View "Function Logs"
4. Look for MongoDB connection errors

---

**Last Updated**: 2025-10-20
