const Redis = require("ioredis");
const logger = require("../utils/logger");

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  // Retry once after 200ms, then give up — prevents request queue build-up
  retryStrategy: (times) => (times > 1 ? null : 200),
  connectTimeout: 3000,
});

redis.on("connect", () => logger.info("[Redis] Connected"));
redis.on("error", (err) => logger.warn("[Redis] Connection error", { message: err.message }));
redis.on("close", () => logger.warn("[Redis] Connection closed"));

module.exports = redis;
