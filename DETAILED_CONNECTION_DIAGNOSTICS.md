# 🔍 Detailed MongoDB Connection Diagnostics

## New Enhanced Diagnostic Endpoints

I've added comprehensive logging to help diagnose connection issues in detail.

---

## 🆕 New Endpoint: Connection Logs

### **GET** `/api/v1/health/connection-logs`

This endpoint provides **DETAILED** diagnostic information about the MongoDB connection.

### Usage:

```bash
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs
```

---

## 📊 What You'll See

### Example Response (When Connected):

```json
{
  "success": true,
  "timestamp": "2025-10-22T19:00:00.000Z",
  "connection": {
    "readyState": 1,
    "readyStateText": "connected",
    "host": "onlinestore.7moscj.mongodb.net",
    "name": "onlineshopping",
    "port": 27017,
    "config": {
      "serverSelectionTimeoutMS": 5000,
      "socketTimeoutMS": 45000,
      "maxPoolSize": 10,
      "minPoolSize": 1
    },
    "models": ["User", "Product", "Order", ...],
    "collections": ["users", "products", "orders", ...]
  },
  "environment": {
    "mongodbUri": {
      "exists": true,
      "length": 180,
      "preview": "mongodb+srv://Vercel-Admin...onlineshopping?retryWrites=true",
      "hasProtocol": true,
      "hasDatabase": true,
      "hasOptions": true
    },
    "nodejs": {
      "version": "v22.18.0",
      "platform": "linux",
      "memory": {
        "rss": "103.77 MB",
        "heapUsed": "32.56 MB"
      }
    },
    "vercel": {
      "isVercel": true,
      "region": "iad1",
      "env": "production"
    }
  }
}
```

---

### Example Response (When Disconnected):

```json
{
  "success": false,
  "connection": {
    "readyState": 0,
    "readyStateText": "disconnected",
    "host": "not connected",
    "name": "not connected"
  },
  "environment": {
    "mongodbUri": {
      "exists": false,  // ❌ URI NOT SET!
      "hasDatabase": false,  // ❌ Missing /onlineshopping
      "hasProtocol": false
    },
    "vercel": {
      "isVercel": true,
      "env": "production"
    }
  },
  "recommendation": {
    "message": "Database is not connected",
    "steps": [
      "1. Verify onlineshopping_MONGODB_URI is set in Vercel Environment Variables",
      "2. Check URI format: mongodb+srv://user:pass@host/onlineshopping?options",
      "3. Ensure database name \"/onlineshopping\" is present in URI",
      "4. Whitelist 0.0.0.0/0 in MongoDB Atlas Network Access",
      "5. Wait 2-3 minutes after making changes",
      "6. Redeploy on Vercel without cache"
    ]
  }
}
```

---

## 🎯 How to Diagnose Issues

### Step 1: Check if URI Exists

Look at `environment.mongodbUri.exists`:

```json
"mongodbUri": {
  "exists": false  // ❌ NOT SET!
}
```

**If `false`:**
- Environment variable `onlineshopping_MONGODB_URI` is NOT set in Vercel
- **Action:** Add it in Vercel Dashboard → Settings → Environment Variables

---

### Step 2: Check Database Name

Look at `environment.mongodbUri.hasDatabase`:

```json
"mongodbUri": {
  "exists": true,
  "hasDatabase": false  // ❌ Missing database name!
}
```

**If `false`:**
- URI is missing `/onlineshopping` database name
- **Action:** Update URI to include `/onlineshopping` before `?`

---

### Step 3: Check Connection State

Look at `connection.readyState`:

```json
"connection": {
  "readyState": 0,  // 0 = disconnected
  "readyStateText": "disconnected"
}
```

**States:**
- `0` = **disconnected** ❌
- `1` = **connected** ✅
- `2` = **connecting** ⏳
- `3` = **disconnecting** ⚠️

---

### Step 4: Check Last Error

Look at `lastError`:

```json
"lastError": {
  "message": "Authentication failed",
  "code": "EAUTH"
}
```

**Common errors:**
- `Authentication failed` → Wrong username/password
- `Server selection timed out` → IP not whitelisted
- `Network error` → MongoDB server unreachable
- `Database does not exist` → Missing database name in URI

---

## 🔍 Enhanced Database Endpoint

### **GET** `/api/v1/health/database` (Updated)

Now includes detailed diagnostics:

```bash
curl https://YOUR_APP.vercel.app/api/v1/health/database
```

### New Fields Added:

```json
{
  "diagnostics": {
    "connectionState": 0,
    "stateDescription": "disconnected",
    "mongooseVersion": "8.18.3",
    "nodeVersion": "v22.18.0",
    "platform": "linux",
    "environment": "development",
    "vercelEnvironment": true,
    "uriConfigured": false,  // ❌ Check this!
    "uriPreview": "NOT SET",
    "connectionOptions": {
      "serverSelectionTimeoutMS": 5000,
      "socketTimeoutMS": 45000,
      "maxPoolSize": 10
    },
    "lastError": {
      "message": "Connection timeout",
      "code": "ETIMEDOUT"
    }
  },
  "troubleshooting": {
    "checkList": [
      "Verify onlineshopping_MONGODB_URI is set in Vercel dashboard",
      "Check URI includes database name: /onlineshopping",
      "Whitelist 0.0.0.0/0 in MongoDB Atlas Network Access",
      ...
    ]
  }
}
```

---

## 📋 Quick Diagnostic Checklist

Use these endpoints to verify:

### 1. Connection Logs (Most Detailed)
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs | jq
```

**Check:**
- [ ] `success`: true
- [ ] `connection.readyState`: 1
- [ ] `environment.mongodbUri.exists`: true
- [ ] `environment.mongodbUri.hasDatabase`: true
- [ ] `environment.vercel.isVercel`: true

---

### 2. Database Health (With Diagnostics)
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/database | jq
```

**Check:**
- [ ] `diagnostics.uriConfigured`: true
- [ ] `diagnostics.connectionState`: 1
- [ ] `diagnostics.lastError`: null

---

### 3. Environment Variables
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/env-check | jq
```

**Check:**
- [ ] `onlineshopping_MONGODB_URI_EXISTS`: true
- [ ] `onlineshopping_MONGODB_URI_LENGTH`: > 100

---

### 4. Complete Status
```bash
curl https://YOUR_APP.vercel.app/api/v1/health/status | jq
```

**Check:**
- [ ] `database.status`: "connected"
- [ ] `database.readyState`: 1

---

## 🛠️ Troubleshooting Workflow

### Step-by-Step:

1. **Call `/connection-logs` endpoint**
   ```bash
   curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs | jq > logs.json
   ```

2. **Check `environment.mongodbUri.exists`**
   - If `false` → Add variable to Vercel
   - If `true` → Continue to step 3

3. **Check `environment.mongodbUri.hasDatabase`**
   - If `false` → Add `/onlineshopping` to URI
   - If `true` → Continue to step 4

4. **Check `connection.readyState`**
   - If `0` (disconnected) → Check `lastError`
   - If `2` (connecting) → Wait and retry
   - If `1` (connected) → Success! ✅

5. **Check `lastError`**
   - Authentication → Verify credentials
   - Timeout → Whitelist IP in MongoDB Atlas
   - Network → Check MongoDB cluster status

---

## 📊 Comparison: Before vs After

### Before (Limited Info):
```json
{
  "status": "disconnected",
  "readyState": 0
}
```
**❌ Not helpful for diagnosis**

### After (Detailed Info):
```json
{
  "connection": {
    "readyState": 0,
    "readyStateText": "disconnected"
  },
  "environment": {
    "mongodbUri": {
      "exists": false,  // ← NOW WE KNOW THE PROBLEM!
      "hasDatabase": false
    }
  },
  "recommendation": {
    "steps": [
      "1. Verify onlineshopping_MONGODB_URI is set...",
      ...
    ]
  }
}
```
**✅ Clear diagnosis and solution!**

---

## 🎯 Common Scenarios

### Scenario 1: URI Not Set

**Diagnosis:**
```json
{
  "environment": {
    "mongodbUri": {
      "exists": false
    }
  }
}
```

**Solution:**
1. Vercel Dashboard → Settings → Environment Variables
2. Add: `onlineshopping_MONGODB_URI`
3. Value: `mongodb+srv://...`
4. Redeploy

---

### Scenario 2: Missing Database Name

**Diagnosis:**
```json
{
  "environment": {
    "mongodbUri": {
      "exists": true,
      "hasDatabase": false  // ❌
    }
  }
}
```

**Solution:**
Update URI from:
```
...@host/?retryWrites=true
```
To:
```
...@host/onlineshopping?retryWrites=true
```

---

### Scenario 3: IP Not Whitelisted

**Diagnosis:**
```json
{
  "lastError": {
    "message": "Server selection timed out",
    "code": "ETIMEDOUT"
  }
}
```

**Solution:**
1. MongoDB Atlas → Network Access
2. Add IP: `0.0.0.0/0`
3. Wait 2-3 minutes

---

## 🚀 Quick Commands

```bash
# Save all diagnostic info
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs > diagnostics.json

# Check only connection state
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs | jq '.connection.readyState'

# Check if URI exists
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs | jq '.environment.mongodbUri.exists'

# Get recommendations
curl https://YOUR_APP.vercel.app/api/v1/health/connection-logs | jq '.recommendation'

# Check all health endpoints
for endpoint in database ping status env-check connection-logs; do
  echo "=== $endpoint ==="
  curl -s https://YOUR_APP.vercel.app/api/v1/health/$endpoint | jq '.success'
done
```

---

## ✅ Success Indicators

When everything is working:

```json
{
  "success": true,
  "connection": {
    "readyState": 1,
    "readyStateText": "connected",
    "host": "onlinestore.7moscj.mongodb.net",
    "name": "onlineshopping"
  },
  "environment": {
    "mongodbUri": {
      "exists": true,
      "hasProtocol": true,
      "hasDatabase": true,
      "hasOptions": true
    }
  },
  "recommendation": {
    "message": "Database is connected successfully",
    "status": "healthy"
  }
}
```

---

**Created:** 2025-10-22  
**Endpoints:** 6 health check endpoints with detailed diagnostics  
**Purpose:** Comprehensive MongoDB connection troubleshooting
