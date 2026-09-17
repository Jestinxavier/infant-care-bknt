const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  sendEvent,
  buildUserData,
  getClientIp,
  getClientUserAgent,
} = require("../services/metaConversionService");
const logger = require("../utils/logger");

const metaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/v1/meta/event
 * Allows frontend to forward events (e.g., ViewContent, AddToCart, InitiateCheckout)
 * to Meta Conversions API with server-enriched IP and User-Agent.
 */
router.post("/event", metaLimiter, async (req, res) => {
  try {
    const {
      eventName,
      eventId,
      eventSourceUrl,
      customData = {},
      userData: clientUserData = {},
    } = req.body;

    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: "eventName is required",
      });
    }

    const clientIp = getClientIp(req);
    const clientUserAgent = getClientUserAgent(req);
    const fbp = clientUserData.fbp || req.cookies?._fbp || null;
    const fbc = clientUserData.fbc || req.cookies?._fbc || null;

    const userData = buildUserData({
      ...clientUserData,
      clientIp,
      clientUserAgent,
      fbp,
      fbc,
    });

    // Fire and forget, or return status
    sendEvent({
      eventName,
      eventId,
      eventSourceUrl,
      userData,
      customData,
      actionSource: "website",
    }).catch((err) =>
      logger.error(`[META CAPI] Error sending event "${eventName}":`, err)
    );

    return res.status(200).json({
      success: true,
      message: `Meta CAPI event "${eventName}" queued`,
    });
  } catch (error) {
    logger.error("[META CAPI] Error processing event:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process Meta event",
    });
  }
});

module.exports = router;
