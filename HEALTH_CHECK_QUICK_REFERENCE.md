# 🏥 Health Check API - Quick Reference

## 🚀 Quick Start

Test the health endpoints immediately:

```bash
# Database status
curl http://localhost:3000/api/v1/health/database

# Database ping
curl http://localhost:3000/api/v1/health/ping

# Complete health
curl http://localhost:3000/api/v1/health/status
```

Or run the automated test:

```bash
./test-health-api.sh
```

---

## 📍 3 Endpoints Available

| Endpoint | Purpose | Use When |
|----------|---------|----------|
| `/api/v1/health/database` | Check MongoDB connection | Need connection details |
| `/api/v1/health/ping` | Measure database latency | Testing performance |
| `/api/v1/health/status` | Complete system overview | Monitoring everything |

---

## ✅ Success Response

```json
{
  "success": true,
  "status": "connected",
  "message": "✅ Database is connected and healthy"
}
```

## ❌ Error Response

```json
{
  "success": false,
  "status": "disconnected",
  "message": "❌ Database is disconnected",
  "error": {
    "details": "Database connection is not established",
    "possibleReasons": [...]
  }
}
```

---

## 🎯 Common Issues & Solutions

### Issue: 503 Error

**Cause:** MongoDB not connected

**Fix:**
1. Check `.env` has correct `MONGO_URI`
2. Verify MongoDB server is running
3. Check network/firewall settings

### Issue: Slow Response

**Cause:** Network latency

**Fix:**
1. Check `/ping` endpoint for response time
2. Consider using closer MongoDB region
3. Verify internet connection

---

## 📚 Full Documentation

See [HEALTH_CHECK_API.md](./HEALTH_CHECK_API.md) for complete documentation.

---

**Created:** 2025-10-20
