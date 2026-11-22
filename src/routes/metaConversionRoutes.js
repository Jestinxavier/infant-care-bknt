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

const ALLOWED_EVENT_NAMES = new Set([
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "AddPaymentInfo",
  "CompleteRegistration",
  "Contact",
  "Lead",
]);

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

    // This endpoint is public, so only forward standard browser events.
    // Arbitrary names get stored by Meta as custom events (scanners used this
    // to inject payloads like "InputData> BCC:…@oastify.com", which Meta then
    // flagged and blocked). Purchase is sent server-side only, never from here.
    if (typeof eventName !== "string" || !ALLOWED_EVENT_NAMES.has(eventName)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported eventName",
      });
    }

    if (
      eventId != null &&
      (typeof eventId !== "string" || eventId.length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid eventId",
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
