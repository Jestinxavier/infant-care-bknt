# 🔄 Environment Variable Name Update

## ⚠️ CRITICAL CHANGE

The MongoDB connection string environment variable has been renamed to include a project prefix:

```
❌ OLD: MONGODB_URI
✅ NEW: onlineshopping_MONGODB_URI
```

---

## 🎯 Why This Change?

Adding a project-specific prefix (`onlineshopping_`) helps:
- ✅ Avoid conflicts with other projects on the same server
- ✅ Clearly identify which app the variable belongs to
- ✅ Better organization in multi-project deployments
- ✅ Prevent accidental usage of wrong database

---

## 🚨 REQUIRED ACTIONS

### 1. Update Local `.env` File

**Change:**
```env
# ❌ OLD
MONGODB_URI=mongodb+srv://...

# ✅ NEW
onlineshopping_MONGODB_URI=mongodb+srv://...
```

---

### 2. Update Vercel Environment Variables

**CRITICAL**: You MUST update this in Vercel dashboard!

#### Step-by-Step:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project**
3. **Go to Settings → Environment Variables**

4. **Delete the old variable:**
   - Find `MONGODB_URI`
   - Click **"⋯"** (three dots)
   - Click **"Delete"**
   - Confirm deletion

5. **Add the new variable:**
   - Click **"Add New"**
   - **Name**: `onlineshopping_MONGODB_URI`
   - **Value**: `mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0`
   - **Environment**: ✅ Check ALL (Production, Preview, Development)
   - Click **"Save"**

6. **Redeploy:**
   - Go to **Deployments** tab
   - Click **"⋯"** → **"Redeploy"**
   - Uncheck "Use existing build cache"
   - Click **"Redeploy"**

---

## 📋 Files Updated

The following files have been updated automatically:

### Code Files:
- ✅ `/src/server.js`
- ✅ `/src/controllers/health/healthController.js`
- ✅ `.env`
- ✅ `.env.example`

---

## 🧪 Verify the Change

### Test Locally:

```bash
# Start the server
npm run dev
```

**Expected console output:**
```
Environment: development
onlineshopping_MONGODB_URI exists: true
🔄 Setting up standard MongoDB connection...
✅ MongoDB Connected
```

### Test on Vercel (after deployment):

```bash
# Check environment variables
curl https://YOUR_APP.vercel.app/api/v1/health/env-check
```

**Expected response:**
```json
{
  "onlineshopping_MONGODB_URI_EXISTS": true,
  "onlineshopping_MONGODB_URI_PREVIEW": "mongodb+srv://Jestin..."
}
```

### Test database connection:

```bash
curl https://YOUR_APP.vercel.app/api/v1/health/database
```

**Expected response:**
```json
{
  "success": true,
  "status": "connected",
  "database": {
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping"
  }
}
```

---

## ⚡ Quick Migration Checklist

- [x] Updated code files to use `onlineshopping_MONGODB_URI`
- [x] Updated `.env` file locally
- [x] Updated `.env.example` template
- [ ] **DELETE `MONGODB_URI` from Vercel dashboard**
- [ ] **ADD `onlineshopping_MONGODB_URI` to Vercel dashboard**
- [ ] Select all environments (Production, Preview, Development)
- [ ] Redeploy on Vercel (without cache)
- [ ] Test `/health/env-check` endpoint
- [ ] Test `/health/database` endpoint
- [ ] Verify connection is successful

---

## 🔍 Troubleshooting

### Error: "onlineshopping_MONGODB_URI is missing"

**Cause:** Variable not set or using old name

**Fix:**
1. Check `.env` file has `onlineshopping_MONGODB_URI=...`
2. Verify Vercel has `onlineshopping_MONGODB_URI` (not old `MONGODB_URI`)
3. Restart local server: `npm run dev`
4. Redeploy on Vercel

---

### Error: Database still disconnected

**Checklist:**
- [ ] Variable name is exactly `onlineshopping_MONGODB_URI` (case-sensitive)
- [ ] Value is the complete MongoDB connection string
- [ ] IP 0.0.0.0/0 is whitelisted in MongoDB Atlas
- [ ] Vercel environment variable is set for all environments
- [ ] Redeployed after adding variable

---

### Error: "Cannot find environment variable"

**Solution:**
1. Double-check spelling: `onlineshopping_MONGODB_URI`
2. No extra spaces in variable name
3. Restart server/redeploy after adding

---

## 📊 Comparison

### Before:
```javascript
// Generic variable name
process.env.MONGODB_URI

// Could conflict with other projects
```

### After:
```javascript
// Project-specific variable name
process.env.onlineshopping_MONGODB_URI

// No conflicts, clear ownership
```

---

## 🎯 Next Steps

1. **Update Vercel Dashboard NOW:**
   - Delete: `MONGODB_URI`
   - Add: `onlineshopping_MONGODB_URI`

2. **Commit changes to git:**
   ```bash
   git add .
   git commit -m "Update MongoDB env variable to onlineshopping_MONGODB_URI"
   git push origin main
   ```

3. **Redeploy on Vercel**

4. **Test endpoints:**
   ```bash
   curl https://YOUR_APP.vercel.app/api/v1/health/database
   ```

---

## 📚 Related Documentation

- [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md)
- [MONGODB_IP_WHITELIST_GUIDE.md](MONGODB_IP_WHITELIST_GUIDE.md)
- [VERCEL_ENV_SETUP.md](VERCEL_ENV_SETUP.md)

---

## ✅ Success Confirmation

After completing all steps, you should see:

**Local development:**
```
onlineshopping_MONGODB_URI exists: true
✅ MongoDB Connected
```

**Vercel deployment:**
```json
{
  "success": true,
  "status": "connected",
  "message": "✅ Database is connected and healthy"
}
```

---

**Updated:** 2025-10-20  
**Version:** 3.0.0  
**Breaking Change:** Yes - requires environment variable update in Vercel
