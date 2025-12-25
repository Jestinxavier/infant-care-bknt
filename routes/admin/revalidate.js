const express = require("express");
const router = express.Router();
const verifyToken = require("../../src/middlewares/authMiddleware");
const requireAdmin = require("../../src/middlewares/adminMiddleware");

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
