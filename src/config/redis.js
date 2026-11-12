const Redis = require("ioredis");
const logger = require("../utils/logger");

/**
 * Turn REDIS_URL into ioredis connection options with the WHATWG URL parser.
 * Passing the URL string straight to ioredis makes it call Node's legacy
 * url.parse(), which logs a DEP0169 deprecation warning on every start.
 * Anything this doesn't recognise (e.g. a unix socket path) is returned as-is
 * so ioredis can handle it exactly as before.
 */
function connectionFromUrl(redisUrl) {
  let parsed;
  try {
    parsed = new URL(redisUrl);
  } catch {
    return redisUrl;
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    return redisUrl;
  }

  const options = {
    host: parsed.hostname || "localhost",
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  const db = parsed.pathname.replace(/^\//, "");
  if (db) options.db = Number(db);
  // rediss:// means TLS (same as ioredis does for the URL form)
  if (parsed.protocol === "rediss:") options.tls = {};
  return options;
}

const connection = connectionFromUrl(
  process.env.REDIS_URL || "redis://localhost:6379",
);

const clientOptions = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  // Retry once after 200ms, then give up — prevents request queue build-up
  retryStrategy: (times) => (times > 1 ? null : 200),
  connectTimeout: 3000,
};

const redis =
  typeof connection === "string"
    ? new Redis(connection, clientOptions)
    : new Redis({ ...connection, ...clientOptions });

redis.on("connect", () => logger.info("[Redis] Connected"));
redis.on("error", (err) => logger.warn("[Redis] Connection error", { message: err.message }));
redis.on("close", () => logger.warn("[Redis] Connection closed"));

module.exports = redis;
module.exports.connectionFromUrl = connectionFromUrl;
