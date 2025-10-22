# 🔧 Vercel Build Error Troubleshooting

## 🚨 Error Message

```
An unexpected error happened when running this build.
We have been notified of the problem.
This may be a transient error.
```

---

## ✅ SOLUTIONS APPLIED

### 1. Updated `vercel.json` Configuration

**Changed from old format:**
```json
{
  "version": 2,
  "builds": [...],
  "routes": [...]
}
```

**To modern format:**
```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/src/server.js"
    }
  ]
}
```

### 2. Added Node.js Version Specification

**Added to `package.json`:**
```json
{
  "engines": {
    "node": ">=18.x"
  }
}
```

---

## 🔍 Common Causes & Fixes

### Issue 1: Build Configuration Error

**Symptoms:**
- Generic "unexpected error" message
- Build fails immediately
- No detailed error logs

**Solution:**
✅ Use simplified `vercel.json` with `rewrites` instead of `builds` and `routes`

---

### Issue 2: Node.js Version Mismatch

**Symptoms:**
- Package installation fails
- "Module not found" errors
- Compatibility warnings

**Solution:**
✅ Specify Node.js version in `package.json`:
```json
"engines": {
  "node": ">=18.x"
}
```

---

### Issue 3: Missing Dependencies

**Symptoms:**
- "Cannot find module" errors
- Build succeeds but function fails
- Runtime errors

**Solution:**
✅ Make sure all dependencies are in `dependencies` (not `devDependencies`):
```bash
npm install --save @vercel/functions mongodb mongoose
```

---

### Issue 4: Environment Variables Not Set

**Symptoms:**
- "MONGODB_URI is not defined"
- Connection errors
- Database disconnected

**Solution:**
✅ Add all required variables in Vercel Dashboard:
- `MONGODB_URI`
- `NODE_ENV`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- All other required variables

---

### Issue 5: Build Timeout

**Symptoms:**
- Build takes too long
- Times out during npm install
- Slow dependency installation

**Solution:**
✅ Use `.vercelignore` to exclude unnecessary files:
```
node_modules
*.md
test/
```

---

## 🚀 Step-by-Step Fix Guide

### Step 1: Clear Vercel Cache

1. Go to Vercel Dashboard
2. Project Settings → General
3. Scroll to "Build & Development Settings"
4. Click "Clear Build Cache"

### Step 2: Check Build Logs

1. Vercel Dashboard → Deployments
2. Click on failed deployment
3. View "Build Logs"
4. Look for specific error messages

### Step 3: Verify Configuration Files

**Check `vercel.json`:**
```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/src/server.js"
    }
  ]
}
```

**Check `package.json`:**
```json
{
  "main": "src/server.js",
  "engines": {
    "node": ">=18.x"
  }
}
```

### Step 4: Verify All Files Are Committed

```bash
git status
git add .
git commit -m "Fix Vercel build configuration"
git push origin main
```

### Step 5: Redeploy

1. Push to git (triggers auto-deploy)
2. Or manual: Vercel Dashboard → Deployments → Redeploy

---

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] `vercel.json` uses modern `rewrites` format
- [ ] `package.json` has `engines` field
- [ ] All dependencies are installed
- [ ] `.vercelignore` excludes unnecessary files
- [ ] All environment variables are set in Vercel
- [ ] Git repository is up to date
- [ ] No syntax errors in code
- [ ] Build works locally (`npm start`)

---

## 🧪 Test Locally Before Deploying

### Test Build:
```bash
npm install
npm start
```

### Test Health Endpoint:
```bash
curl http://localhost:3000/api/v1/health/status
```

**Expected:**
```json
{
  "success": true,
  "server": {
    "status": "running"
  }
}
```

---

## 🔍 View Detailed Build Logs

### Via Vercel Dashboard:
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Click "Deployments"
4. Click on failed deployment
5. Click "View Function Logs" or "Build Logs"

### Via Vercel CLI:
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# View logs
vercel logs YOUR_PROJECT_NAME

# View specific deployment
vercel logs YOUR_PROJECT_NAME --url=YOUR_DEPLOYMENT_URL
```

---

## 🐛 Common Error Messages & Solutions

### Error: "Module not found"

**Cause:** Missing dependency

**Fix:**
```bash
npm install MISSING_PACKAGE
git add package.json package-lock.json
git commit -m "Add missing dependency"
git push
```

---

### Error: "Cannot find module './app'"

**Cause:** Incorrect file path

**Fix:**
Check `server.js`:
```javascript
const app = require("./app"); // ✅ Correct
// Not: require("app") or require("../app")
```

---

### Error: "Invalid configuration"

**Cause:** Malformed `vercel.json`

**Fix:**
Validate JSON at: https://jsonlint.com/
Use simplified config:
```json
{
  "version": 2,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/src/server.js"
    }
  ]
}
```

---

### Error: "Build exceeded maximum duration"

**Cause:** Build takes too long

**Fix:**
1. Remove unnecessary dependencies
2. Use `.vercelignore` to exclude files
3. Check for infinite loops in build scripts

---

## 📊 Verify Deployment

After successful deployment:

### 1. Check Deployment Status
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/status
```

### 2. Check Database Connection
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/database
```

### 3. Check Environment Variables
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/env-check
```

**All should return HTTP 200 with success: true**

---

## 🆘 If Still Not Working

### Check These:

1. **Vercel Status Page**
   - https://www.vercel-status.com/
   - Check for platform outages

2. **Clear Everything and Retry**
   ```bash
   # Clear build cache in Vercel dashboard
   # Delete node_modules locally
   rm -rf node_modules package-lock.json
   npm install
   git add .
   git commit -m "Clean install"
   git push
   ```

3. **Try Different Build Settings**
   - Vercel Dashboard → Settings → Build & Development Settings
   - Build Command: Leave empty (uses package.json)
   - Output Directory: Leave empty
   - Install Command: `npm install`

4. **Contact Vercel Support**
   - https://vercel.com/help
   - Include:
     - Project URL
     - Deployment ID
     - Error message
     - Build logs

---

## ✅ Success Indicators

After fixing, you should see:

### Build Logs:
```
✓ Installing dependencies...
✓ Building...
✓ Uploading...
✓ Deployment ready
```

### Health Check:
```json
{
  "success": true,
  "status": "connected",
  "message": "✅ All systems operational"
}
```

---

## 📚 Resources

- [Vercel Node.js Guide](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)
- [Vercel Configuration](https://vercel.com/docs/projects/project-configuration)
- [Build Step](https://vercel.com/docs/deployments/builds)
- [Environment Variables](https://vercel.com/docs/environment-variables)

---

## 🎯 Quick Fix Summary

1. ✅ Updated `vercel.json` to use `rewrites`
2. ✅ Added `engines` to `package.json`
3. ✅ Ensured all dependencies are installed
4. ✅ Set all environment variables in Vercel
5. ✅ Committed and pushed changes
6. ✅ Triggered redeploy

**Your deployment should work now! 🚀**

---

**Last Updated:** 2025-10-20  
**Status:** ✅ Configuration Fixed
