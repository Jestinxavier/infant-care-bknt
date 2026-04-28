const redis = require("../config/redis");

// Per-domain TTLs (seconds)
const TTL = {
  PRODUCT: 60 * 60,        // 1 hour  — product pages, by URL key
  CATEGORY: 60 * 60 * 2,  // 2 hours — category trees change rarely
  CART_SETTINGS: 5 * 60,  // 5 min   — shipping thresholds
  DASHBOARD: 5 * 60,      // 5 min   — admin dashboard stats
  FILTER_META: 30 * 60,   // 30 min  — filter attribute metadata
  DEFAULT: 60 * 60,        // 1 hour  — fallback
};

async function cacheGet(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, data, ttl = TTL.DEFAULT) {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch {
    // non-fatal — cache miss on next request is acceptable
  }
}

async function cacheDel(...keys) {
  try {
    if (keys.length) await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

// Safe pattern delete using SCAN (never KEYS — blocks event loop in prod)
async function cacheDelPattern(pattern) {
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      if (keys.length) await redis.del(...keys);
      cursor = nextCursor;
    } while (cursor !== "0");
  } catch {
    // non-fatal
  }
}

// Cache-aside helper: returns cached value or calls loader and caches the result.
// Usage: const data = await cacheGetOrSet("key", TTL.PRODUCT, () => fetchFromDB());
async function cacheGetOrSet(key, ttl, loader) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  if (fresh !== null && fresh !== undefined) {
    await cacheSet(key, fresh, ttl);
  }
  return fresh;
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelPattern, cacheGetOrSet, TTL };
