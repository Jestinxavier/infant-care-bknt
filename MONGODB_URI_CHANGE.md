# 🔄 Environment Variable Name Change

## ⚠️ IMPORTANT CHANGE

The MongoDB connection string environment variable has been renamed:

```
❌ OLD: MONGO_URI
✅ NEW: MONGODB_URI
```

---

## 🚨 Action Required

### 1. Update Local `.env` File

**OLD:**
```env
MONGO_URI=mongodb+srv://...
```

**NEW:**
```env
MONGODB_URI=mongodb+srv://...
```

---

### 2. Update Vercel Environment Variables

**CRITICAL**: You MUST update this in Vercel dashboard!

#### Steps:

1. Go to: https://vercel.com/dashboard
2. Click your project → **Settings** → **Environment Variables**
3. **Delete** the old variable:
   - Find `MONGO_URI`
   - Click **"⋯"** (three dots)
   - Click **"Delete"**
   - Confirm deletion

4. **Add** the new variable:
   - Click **"Add New"**
   - **Name**: `MONGODB_URI`
   - **Value**: `mongodb+srv://Jestinxavier:wVpHRcBgctcbzr1L@cluster0.5behn.mongodb.net/onlineshopping?retryWrites=true&w=majority&appName=Cluster0`
   - **Environment**: ✅ Production, Preview, Development
   - Click **"Save"**

5. **Redeploy**:
   - Go to **Deployments** tab
   - Click **"⋯"** → **"Redeploy"**
   - Uncheck "Use existing build cache"
   - Click **"Redeploy"**

---

## 📋 Files Updated

The following files have been updated to use `MONGODB_URI`:

### Code Files:
- ✅ `/src/server.js`
- ✅ `/src/controllers/health/healthController.js`
- ✅ `.env`
- ✅ `.env.example`

### Documentation Files:
(Will auto-update in future references)

---

## 🧪 Verify the Change

After updating and redeploying:

### Test 1: Check Environment Variables
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/env-check
```

**Expected:**
```json
{
  "MONGODB_URI_EXISTS": true,  // ✅ Should be true
  "MONGODB_URI_PREVIEW": "mongodb+srv://Jestin..."
}
```

### Test 2: Check Database Connection
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/database
```

**Expected:**
```json
{
  "success": true,
  "status": "connected"
}
```

---

## ⚡ Quick Migration Checklist

- [ ] Updated `.env` file locally (`MONGO_URI` → `MONGODB_URI`)
- [ ] Deleted `MONGO_URI` from Vercel dashboard
- [ ] Added `MONGODB_URI` to Vercel dashboard
- [ ] Checked all 3 environments (Production, Preview, Development)
- [ ] Redeployed on Vercel (without cache)
- [ ] Tested `/health/env-check` endpoint
- [ ] Tested `/health/database` endpoint
- [ ] Verified `"status": "connected"`

---

## 🔍 Why This Change?

The standard MongoDB environment variable name is `MONGODB_URI` (not `MONGO_URI`). This change:

✅ Follows MongoDB Atlas documentation standards
✅ Matches common Node.js conventions
✅ Improves compatibility with tools and services
✅ Makes the codebase more maintainable

---

## 🆘 Troubleshooting

### Issue: "MONGODB_URI is not defined"

**Cause**: Variable not set in Vercel

**Fix**:
1. Vercel Dashboard → Settings → Environment Variables
2. Add `MONGODB_URI` with correct value
3. Redeploy

---

### Issue: Database still disconnected after update

**Checklist**:
- [ ] Variable name is exactly `MONGODB_URI` (case-sensitive)
- [ ] Value is the full MongoDB connection string
- [ ] Applied to all environments in Vercel
- [ ] Redeployed after adding variable
- [ ] IP is whitelisted in MongoDB Atlas

---

## 📚 Related Documentation

- [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md)
- [MONGODB_IP_WHITELIST_GUIDE.md](MONGODB_IP_WHITELIST_GUIDE.md)
- [ENV_MIGRATION_GUIDE.md](ENV_MIGRATION_GUIDE.md)

---

**Updated**: 2025-10-20  
**Version**: 2.0.0  
**Breaking Change**: Yes - requires environment variable update
