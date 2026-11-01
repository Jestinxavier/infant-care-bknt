// routes/analyticsRoutes.js
// Public analytics tracking (no auth — anonymous behavioral events).
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const { track } = require("../controllers/analyticsController");

// The endpoint is public and each request can carry 20 events, so cap it per
// IP to stop anyone flooding the collection or skewing the AI report funnel.
// A real visitor batches events and stays far below this.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // Tracking is fire-and-forget; an empty response is all the client needs.
  handler: (req, res) => res.status(429).end(),
});

router.post("/track", trackLimiter, track);

module.exports = router;
