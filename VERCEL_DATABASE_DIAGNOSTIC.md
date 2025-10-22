# 🔍 Vercel Database Connection Diagnostic

## 🚨 Current Status

**Error:**
```json
{
  "database": {
    "status": "disconnected",
    "readyState": 0
  }
}
```

**Platform:** Vercel (linux, Node v22.18.0)  
**Environment:** development

---

## ✅ CHECKLIST - Complete ALL Steps

### Step 1: Verify Environment Variable in Vercel

1. Go to: https://vercel.com/dashboard
2. Click your project
3. Go to: **Settings** → **Environment Variables**
4. **MUST HAVE:**
   ```
   Name: onlineshopping_MONGODB_URI
   Value: mongodb+srv://Vercel-Admin-onlinestore:dQMytS3BtpsCDt3c@onlinestore.7moscj.mongodb.net/onlineshopping?retryWrites=true&w=majority
   ```
5. **Verify:**
   - [ ] Variable name is EXACTLY `onlineshopping_MONGODB_URI` (check spelling!)
   - [ ] Value has `/onlineshopping` database name
   - [ ] Applied to: ✅ Production ✅ Preview ✅ Development
   - [ ] No extra spaces or quotes

---

### Step 2: Check Vercel Function Logs

1. **Vercel Dashboard** → **Deployments**
2. Click latest deployment
3. Click **"Functions"** or **"Runtime Logs"**
4. Look for these messages:

**If you see:**
```
❌ onlineshopping_MONGODB_URI is missing
```
**→ Variable not set in Vercel dashboard!**

**If you see:**
```
🔍 Attempting to connect to MongoDB...
❌ MongoDB connection failed: [error message]
```
**→ Check the specific error message**

**Should see:**
```
🔄 Setting up Vercel database connection pooling...
✅ MongoDB Connected with Vercel pooling
```

---

### Step 3: Whitelist IPs in MongoDB Atlas

1. Go to: https://cloud.mongodb.com/
2. Select project: **onlinestore**
3. **Network Access** (left sidebar)
4. **Current IPs should include:**
   - `0.0.0.0/0` (Allow from anywhere)
5. **Status:** Active ✅

**If not:**
- Click "+ ADD IP ADDRESS"
- Select "ALLOW ACCESS FROM ANYWHERE"
- Confirm
- **Wait 2-3 minutes**

---

### Step 4: Verify MongoDB Connection String

**Your URI should be:**
```
mongodb+srv://Vercel-Admin-onlinestore:dQMytS3BtpsCDt3c@onlinestore.7moscj.mongodb.net/onlineshopping?retryWrites=true&w=majority
```

**Check each part:**
- [ ] Protocol: `mongodb+srv://` ✅
- [ ] Username: `Vercel-Admin-onlinestore` ✅
- [ ] Password: `dQMytS3BtpsCDt3c` ✅ (no spaces!)
- [ ] Host: `onlinestore.7moscj.mongodb.net` ✅
- [ ] **Database: `/onlineshopping`** ✅ **CRITICAL!**
- [ ] Options: `?retryWrites=true&w=majority` ✅

**Common mistakes:**
- ❌ Missing database name: `.../`**?**retryWrites (wrong!)
- ✅ Has database name: `.../**onlineshopping**?retryWrites` (correct!)

---

### Step 5: Test Environment Variable Loading

**Use the env-check endpoint:**
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/env-check
```

**Expected response:**
```json
{
  "onlineshopping_MONGODB_URI_EXISTS": true,
  "onlineshopping_MONGODB_URI_PREVIEW": "mongodb+srv://Vercel..."
}
```

**If `false`:**
- Variable not set in Vercel
- Or misspelled (check exact name)

---

### Step 6: Force Redeploy

After making ANY changes:

1. **Vercel Dashboard** → **Deployments**
2. Click **"..."** (three dots) on latest deployment
3. Click **"Redeploy"**
4. **UNCHECK** "Use existing build cache" ← IMPORTANT!
5. Click **"Redeploy"**
6. **Wait 1-2 minutes** for deployment to complete

---

## 🔍 Detailed Troubleshooting

### Issue A: Variable Not Found

**Symptom:**
```
onlineshopping_MONGODB_URI is not defined
```

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Variable not added to Vercel | Add in Settings → Environment Variables |
| Typo in variable name | Use EXACT name: `onlineshopping_MONGODB_URI` |
| Not applied to all environments | Check Production, Preview, Development |
| Didn't redeploy after adding | Redeploy without cache |

---

### Issue B: Authentication Failed

**Symptom:**
```
MongoDB connection failed: Authentication failed
```

**Check:**
1. Username: `Vercel-Admin-onlinestore` (case-sensitive)
2. Password: `dQMytS3BtpsCDt3c` (no spaces, no quotes)
3. In MongoDB Atlas:
   - Database Access → Users
   - Verify user exists
   - Reset password if needed

---

### Issue C: Network Timeout

**Symptom:**
```
MongoDB connection failed: Server selection timed out
```

**Solutions:**
1. **Whitelist IPs in MongoDB Atlas**
   - Network Access → Add 0.0.0.0/0
   - Wait 2-3 minutes

2. **Check MongoDB Cluster Status**
   - MongoDB Atlas → Clusters
   - Should be "Active" (green)
   - If paused, resume it

---

### Issue D: Database Not Found

**Symptom:**
```
database: null
```

**Cause:** Missing `/onlineshopping` in URI

**Fix:**
```
❌ Wrong: ...@onlinestore.7moscj.mongodb.net/?retryWrites
✅ Right: ...@onlinestore.7moscj.mongodb.net/onlineshopping?retryWrites
```

---

## 🧪 Verification Steps

### After Each Fix, Test:

```bash
# 1. Check env vars
curl https://YOUR_APP.vercel.app/api/v1/health/env-check

# 2. Check database connection
curl https://YOUR_APP.vercel.app/api/v1/health/database

# 3. Check complete status
curl https://YOUR_APP.vercel.app/api/v1/health/status
```

---

## 📊 Expected vs Actual

### ✅ Success State:
```json
{
  "success": true,
  "database": {
    "status": "connected",
    "readyState": 1,
    "host": "onlinestore.7moscj.mongodb.net",
    "name": "onlineshopping"
  }
}
```

### ❌ Current State:
```json
{
  "success": false,
  "database": {
    "status": "disconnected",
    "readyState": 0,
    "host": null,
    "name": null
  }
}
```

---

## 🎯 Most Likely Issues

Based on your error, check these IN ORDER:

1. **Variable not in Vercel dashboard** (90% of cases)
   - Add `onlineshopping_MONGODB_URI` to Vercel
   - Redeploy

2. **IP not whitelisted** (8% of cases)
   - MongoDB Atlas → Network Access → 0.0.0.0/0
   - Wait 2 minutes

3. **Database name missing from URI** (2% of cases)
   - Add `/onlineshopping` before `?`

---

## 📝 Quick Fix Script

Run these commands to verify:

```bash
# Set your Vercel URL
VERCEL_URL="your-app.vercel.app"

# Check environment
echo "1. Checking environment variables..."
curl -s https://$VERCEL_URL/api/v1/health/env-check | jq

# Check database
echo "2. Checking database connection..."
curl -s https://$VERCEL_URL/api/v1/health/database | jq

# Check IP info
echo "3. Checking IP information..."
curl -s https://$VERCEL_URL/api/v1/health/ip-info | jq
```

---

## 🆘 Still Not Working?

### Get Detailed Logs:

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login:**
   ```bash
   vercel login
   ```

3. **View Logs:**
   ```bash
   vercel logs YOUR_PROJECT_NAME --follow
   ```

4. **Look for:**
   - `❌ MongoDB connection failed`
   - `onlineshopping_MONGODB_URI is missing`
   - Connection error messages

---

## ✅ Final Checklist

Before asking for help, verify:

- [ ] `onlineshopping_MONGODB_URI` is set in Vercel dashboard
- [ ] Variable has `/onlineshopping` database name in URI
- [ ] Applied to ALL environments (Production, Preview, Development)
- [ ] IP `0.0.0.0/0` is whitelisted in MongoDB Atlas
- [ ] Waited 2-3 minutes after whitelisting IP
- [ ] Redeployed WITHOUT cache
- [ ] Checked Vercel function logs for errors
- [ ] Tested all 3 health endpoints
- [ ] MongoDB cluster is active (not paused)

---

**Last Updated:** 2025-10-22  
**Status:** Diagnostic Guide  
**Priority:** P0 - Critical
