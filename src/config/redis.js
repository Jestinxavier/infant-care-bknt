const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

redis.on("connect", () => console.log("✅ [Redis] Connected"));
redis.on("error", (err) => console.error("❌ [Redis]", err.message));

module.exports = redis;
