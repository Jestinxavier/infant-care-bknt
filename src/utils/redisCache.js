const redis = require("../config/redis");

const TTL = 60 * 60; // 1 hour

async function cacheGet(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, data, ttl = TTL) {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

async function cacheDel(...keys) {
  try {
    if (keys.length) await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

async function cacheDelPattern(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelPattern };
