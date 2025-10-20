# 🏥 Health Check API Documentation

## Overview

The Health Check API provides endpoints to monitor MongoDB connection status and overall system health. These endpoints are useful for:

- **DevOps Monitoring**: Check if services are running properly
- **Load Balancers**: Health checks for traffic routing
- **Debugging**: Quickly identify database connection issues
- **Status Dashboards**: Real-time system monitoring

---

## 📍 Endpoints

### 1. Database Connection Status

**GET** `/api/v1/health/database`

Check MongoDB connection status with detailed information.

#### Request

```bash
curl http://localhost:3000/api/v1/health/database
```

#### Response (Connected)

**Status:** `200 OK`

```json
{
  "success": true,
  "status": "connected",
  "timestamp": "2025-10-20T10:30:45.123Z",
  "database": {
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping",
    "port": 27017,
    "models": ["User", "Product", "Order", "Payment", "Review", "Variant", "Address"],
    "collections": ["users", "products", "orders", "payments", "reviews", "variants", "addresses"]
  },
  "message": "✅ Database is connected and healthy"
}
```

#### Response (Disconnected)

**Status:** `503 Service Unavailable`

```json
{
  "success": false,
  "status": "disconnected",
  "timestamp": "2025-10-20T10:30:45.123Z",
  "database": null,
  "message": "❌ Database is disconnected",
  "error": {
    "state": 0,
    "details": "Database connection is not established",
    "possibleReasons": [
      "MongoDB server is down",
      "Invalid MONGO_URI in .env file",
      "Network connectivity issues",
      "Authentication failed",
      "Database does not exist"
    ]
  }
}
```

---

### 2. Database Ping

**GET** `/api/v1/health/ping`

Actively ping the database to verify connectivity and measure response time.

#### Request

```bash
curl http://localhost:3000/api/v1/health/ping
```

#### Response (Success)

**Status:** `200 OK`

```json
{
  "success": true,
  "status": "connected",
  "timestamp": "2025-10-20T10:30:45.123Z",
  "message": "✅ Database ping successful",
  "responseTime": "45ms",
  "database": {
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping",
    "port": 27017
  }
}
```

#### Response (Failed)

**Status:** `503 Service Unavailable`

```json
{
  "success": false,
  "status": "error",
  "timestamp": "2025-10-20T10:30:45.123Z",
  "message": "❌ Database ping failed",
  "error": {
    "message": "MongoNetworkError: connection timed out",
    "code": "ETIMEDOUT",
    "stack": "Error stack trace (development only)"
  }
}
```

---

### 3. Complete Health Status

**GET** `/api/v1/health/status`

Get comprehensive health information including server and database status.

#### Request

```bash
curl http://localhost:3000/api/v1/health/status
```

#### Response (All Systems Operational)

**Status:** `200 OK`

```json
{
  "success": true,
  "timestamp": "2025-10-20T10:30:45.123Z",
  "server": {
    "status": "running",
    "uptime": "2h 15m 30s",
    "nodeVersion": "v18.17.0",
    "environment": "development",
    "platform": "darwin",
    "memory": {
      "rss": "125.45 MB",
      "heapTotal": "50.25 MB",
      "heapUsed": "35.80 MB",
      "external": "2.15 MB"
    }
  },
  "database": {
    "status": "connected",
    "readyState": 1,
    "host": "cluster0.5behn.mongodb.net",
    "name": "onlineshopping",
    "port": 27017
  },
  "message": "✅ All systems operational"
}
```

#### Response (Database Issue)

**Status:** `503 Service Unavailable`

```json
{
  "success": false,
  "timestamp": "2025-10-20T10:30:45.123Z",
  "server": {
    "status": "running",
    "uptime": "2h 15m 30s",
    "nodeVersion": "v18.17.0",
    "environment": "development",
    "platform": "darwin",
    "memory": {
      "rss": "125.45 MB",
      "heapTotal": "50.25 MB",
      "heapUsed": "35.80 MB",
      "external": "2.15 MB"
    }
  },
  "database": {
    "status": "disconnected",
    "readyState": 0,
    "host": null,
    "name": null,
    "port": null,
    "error": {
      "message": "Database not connected",
      "state": "disconnected"
    }
  },
  "message": "⚠️ Database connection issue detected"
}
```

---

## 🔍 Connection States

MongoDB connection can be in one of these states:

| State | Value | Description |
|-------|-------|-------------|
| `disconnected` | 0 | Not connected to MongoDB |
| `connected` | 1 | Successfully connected |
| `connecting` | 2 | Connection in progress |
| `disconnecting` | 3 | Disconnection in progress |

---

## 💡 Use Cases

### 1. Kubernetes Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health/status
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### 2. Docker Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD curl -f http://localhost:3000/api/v1/health/database || exit 1
```

### 3. Load Balancer Health Check

Configure your load balancer (AWS ELB, nginx, etc.) to use:
```
Path: /api/v1/health/ping
Expected Status: 200
Timeout: 5 seconds
Interval: 30 seconds
```

### 4. Monitoring Dashboard

```javascript
// Frontend code to display health status
const checkHealth = async () => {
  const response = await fetch('http://localhost:3000/api/v1/health/status');
  const data = await response.json();
  
  if (data.success) {
    console.log('✅ System healthy');
  } else {
    console.error('❌ System unhealthy:', data);
  }
};

// Check every 30 seconds
setInterval(checkHealth, 30000);
```

### 5. CI/CD Pipeline Check

```bash
#!/bin/bash
# Wait for database to be ready

MAX_RETRIES=30
RETRY_INTERVAL=2

for i in $(seq 1 $MAX_RETRIES); do
  echo "Checking database health (attempt $i/$MAX_RETRIES)..."
  
  RESPONSE=$(curl -s http://localhost:3000/api/v1/health/database)
  SUCCESS=$(echo $RESPONSE | jq -r '.success')
  
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Database is ready!"
    exit 0
  fi
  
  echo "⏳ Database not ready yet, waiting..."
  sleep $RETRY_INTERVAL
done

echo "❌ Database failed to become ready"
exit 1
```

---

## 🧪 Testing

### Test with cURL

```bash
# Check database status
curl http://localhost:3000/api/v1/health/database

# Ping database
curl http://localhost:3000/api/v1/health/ping

# Get complete health
curl http://localhost:3000/api/v1/health/status
```

### Test with JavaScript

```javascript
// Using fetch
const checkDatabaseHealth = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/v1/health/database');
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Database connected:', data.database);
    } else {
      console.error('❌ Database error:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
};

checkDatabaseHealth();
```

### Test with Postman

1. Create a new GET request
2. URL: `http://localhost:3000/api/v1/health/status`
3. Send request
4. Check response status and body

---

## 🔧 Troubleshooting

### Issue: Always Returns "disconnected"

**Possible Causes:**
1. MongoDB server is down
2. Incorrect `MONGO_URI` in `.env` file
3. Network firewall blocking connection
4. IP not whitelisted (MongoDB Atlas)

**Solutions:**
```bash
# Check MONGO_URI is set
echo $MONGO_URI

# Test connection manually
mongosh "your_mongo_uri_here"

# Verify IP whitelist in MongoDB Atlas
# Go to Network Access → Add current IP
```

### Issue: Slow Response Time

**Possible Causes:**
1. Database server far from application
2. Network latency issues
3. Database under heavy load

**Solutions:**
- Check `/api/v1/health/ping` response time
- Consider using a closer MongoDB region
- Scale database resources if needed

### Issue: 503 Error on Startup

**Expected Behavior:**
- Health checks may fail during server startup
- Wait 5-10 seconds after starting server
- Connection takes time to establish

---

## 📊 Response Time Benchmarks

Typical response times:

| Endpoint | Expected Time | Action if Slower |
|----------|---------------|------------------|
| `/database` | < 10ms | Check local network |
| `/ping` | < 50ms | Check DB server location |
| `/status` | < 15ms | Check server resources |

---

## 🔒 Security Considerations

### Production Recommendations

1. **Limit Sensitive Information**
   - Don't expose database credentials
   - Hide error stack traces in production
   - Sanitize database host information

2. **Rate Limiting**
   ```javascript
   // Add rate limiting to health endpoints
   const rateLimit = require('express-rate-limit');
   
   const healthLimiter = rateLimit({
     windowMs: 1 * 60 * 1000, // 1 minute
     max: 60 // 60 requests per minute
   });
   
   app.use('/api/v1/health', healthLimiter);
   ```

3. **Authentication (Optional)**
   - Consider protecting health endpoints in production
   - Use API keys for monitoring services
   - Allow only internal networks access

---

## 📚 Related Documentation

- [MongoDB Connection Guide](https://www.mongodb.com/docs/drivers/node/current/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Kubernetes Health Checks](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

---

## 🎯 Quick Reference

```bash
# Check if database is connected
curl http://localhost:3000/api/v1/health/database

# Measure database response time
curl http://localhost:3000/api/v1/health/ping

# Get complete system health
curl http://localhost:3000/api/v1/health/status
```

---

**Created:** 2025-10-20  
**Version:** 1.0.0  
**Author:** Online Shopping Backend Team
