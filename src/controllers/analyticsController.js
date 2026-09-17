// controllers/analyticsController.js
// Public, anonymous behavioral tracking endpoint. The storefront sends
// fire-and-forget events (sendBeacon / keepalive fetch). Never blocks the
// visitor's request: we validate + normalize and insert as quickly as possible.
const AnalyticsEvent = require("../models/AnalyticsEvent");
const logger = require("../utils/logger");

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_STR_LEN = 500;

const ALLOWED_EVENTS = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "begin_checkout",
  "purchase",
]);

function cleanString(value, max = MAX_STR_LEN) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, max);
  return trimmed;
}

function normalizeIp(ip) {
  if (typeof ip !== "string") return "";
  return ip.split(",")[0].trim().slice(0, 45);
}

/**
 * POST /api/v1/analytics/track
 * Body: { events: [{ eventType, visitorId, sessionId, path, referrer,
 *                    productId, productSlug, productName }] }  (max 20)
 * Responds 204 instantly. Events are validated leniently and silently dropped
 * when malformed so tracking can never break the storefront.
 */
const track = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rawEvents = Array.isArray(body.events) ? body.events : [];

    if (body.eventType && Array.isArray(body.events) === false) {
      rawEvents.unshift(body); // accept single event shorthand
    }

    const events = rawEvents
      .slice(0, MAX_EVENTS_PER_REQUEST)
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const eventType = cleanString(e.eventType);
        if (!ALLOWED_EVENTS.has(eventType)) return null;

        const productId =
          typeof e.productId === "string" &&
          /^[0-9a-fA-F]{24}$/.test(e.productId)
            ? e.productId
            : null;

        return {
          eventType,
          visitorId: cleanString(e.visitorId, 100) || null,
          sessionId: cleanString(e.sessionId, 100) || null,
          path: cleanString(e.path),
          referrer: cleanString(e.referrer, 400),
          productId,
          productSlug: cleanString(e.productSlug, 120) || null,
          productName: cleanString(e.productName, 200) || null,
          ua: cleanString(req.headers["user-agent"], 300),
          pageLanguage: cleanString(e.pageLanguage, 20) || null,
        };
      })
      .filter(Boolean);

    if (events.length === 0) {
      return res.status(204).end();
    }

    try {
      await AnalyticsEvent.insertMany(events, { ordered: false });
    } catch (err) {
      logger.warn(`[Analytics] insert failed (${err.message}) — skipping`);
    }

    return res.status(204).end();
  } catch (err) {
    // Never surface tracking errors to the client.
    logger.error(`[Analytics] track error: ${err.message}`);
    return res.status(204).end();
  }
};

module.exports = { track };