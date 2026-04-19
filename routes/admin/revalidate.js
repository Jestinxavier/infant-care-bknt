const express = require("express");
const router = express.Router();
const verifyToken = require("../../src/middlewares/authMiddleware");
const requireAdmin = require("../../src/middlewares/adminMiddleware");
const { cacheDel, cacheDelPattern } = require("../../src/utils/redisCache");

/**
 * Maps a dashboard revalidation request to the Redis keys that should be evicted.
 * Keeps Next.js cache tags and Redis keys in sync from a single call.
 */
async function flushRedisForRevalidation({ tag, type, resource }) {
  if (!tag && !type) {
    // Nuclear option — clear everything we cache
    await cacheDelPattern("cms:*");
    await cacheDel("homepage", "footer", "categories");
    return;
  }

  if (tag === "group:products") return cacheDelPattern("product:*");
  if (tag === "group:categories") return cacheDel("categories");
  if (tag === "group:cms") {
    await cacheDelPattern("cms:*");
    await cacheDel("homepage");
    return;
  }
  if (tag === "group:policies") return cacheDelPattern("cms:policy*");
  if (tag === "layout:header") return; // not cached in Redis yet
  if (tag === "layout:footer") return cacheDel("footer");

  if (type === "product") return cacheDel(`product:${resource}`);
  if (type === "cms") {
    await cacheDelPattern(`cms:${resource}*`);
    // homepage widgets live under a separate key
    if (resource === "home") await cacheDel("homepage");
    return;
  }
  if (type === "policy") return cacheDel(`cms:policies:${resource}`);
}

/**
 * Secure Revalidation Proxy Endpoint
 *
 * This endpoint acts as a secure proxy between the admin dashboard and the Next.js frontend.
 * It keeps REVALIDATE_SECRET and FRONTEND_URL on the server, preventing exposure in the browser.
 *
 * Security:
 * - Requires authentication (protect middleware)
 * - Requires admin role (admin middleware)
 * - Secrets never sent to client
 */
router.post("/revalidate", verifyToken, requireAdmin, async (req, res) => {
  const { type, resource, tag } = req.body;

  // Server-side only - never exposed to client
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

  if (!REVALIDATE_SECRET) {
    return res.status(500).json({
      ok: false,
      error: "REVALIDATE_SECRET not configured on server",
    });
  }

  try {
    // Flush Redis first so the next backend fetch goes to MongoDB
    await flushRedisForRevalidation({ tag, type, resource });

    let url;

    // Build appropriate revalidation URL based on parameters
    if (tag) {
      // Tag-based revalidation
      url = `${FRONTEND_URL}/api/revalidate?key=${REVALIDATE_SECRET}&tag=${encodeURIComponent(
        tag
      )}`;
    } else if (type && resource) {
      // Type+Resource revalidation
      url = `${FRONTEND_URL}/api/revalidate?key=${REVALIDATE_SECRET}&type=${type}&resource=${encodeURIComponent(
        resource
      )}`;
    } else {
      // Revalidate all
      url = `${FRONTEND_URL}/api/revalidate?key=${REVALIDATE_SECRET}`;
    }

    // Forward request to Next.js frontend
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data.error || "Revalidation failed",
        ...data,
      });
    }

    res.json({
      ok: true,
      ...data,
    });
  } catch (error) {
    console.error("Revalidation proxy error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to communicate with frontend",
    });
  }
});

module.exports = router;
