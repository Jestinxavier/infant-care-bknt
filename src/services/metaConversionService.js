const crypto = require("crypto");
const axios = require("axios");
const logger = require("../utils/logger");
const Order = require("../models/Order");

const DEFAULT_PIXEL_ID = "2000618397321574";
const GRAPH_API_VERSION = "v21.0";

/**
 * SHA-256 hash a normalized string according to Meta specifications.
 * Returns null if input is empty or invalid.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
const hashField = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return crypto.createHash("sha256").update(trimmed).digest("hex");
};

/**
 * Normalizes email: trim whitespace and lowercase.
 * @param {string} email
 * @returns {string|null}
 */
const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
};

/**
 * Normalizes phone number to E.164:
 * Removes non-digits. If 10 digits (common in India), prepends '91'.
 *
 * @param {string} phone
 * @returns {string|null}
 */
const normalizePhone = (phone) => {
  if (!phone || typeof phone !== "string") return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // If 10 digits (Indian mobile standard), prepend country code 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return digits;
};

/**
 * Normalizes name (first or last): trim and lowercase.
 * @param {string} name
 * @returns {string|null}
 */
const normalizeName = (name) => {
  if (!name || typeof name !== "string") return null;
  return name.trim().toLowerCase();
};

/**
 * Normalizes city: trim, lowercase, remove punctuation.
 * @param {string} city
 * @returns {string|null}
 */
const normalizeCity = (city) => {
  if (!city || typeof city !== "string") return null;
  return city.trim().toLowerCase().replace(/[^\w\s]/gi, "");
};

/**
 * Normalizes state: trim, lowercase.
 * @param {string} state
 * @returns {string|null}
 */
const normalizeState = (state) => {
  if (!state || typeof state !== "string") return null;
  return state.trim().toLowerCase();
};

/**
 * Normalizes postal code / pincode: trim, lowercase, remove spaces.
 * @param {string} postalCode
 * @returns {string|null}
 */
const normalizePostalCode = (postalCode) => {
  if (!postalCode || typeof postalCode !== "string") return null;
  return postalCode.trim().toLowerCase().replace(/\s+/g, "");
};

/**
 * Normalizes country: 2-character lowercase ISO code. Defaults to 'in'.
 * @param {string} country
 * @returns {string}
 */
const normalizeCountry = (country) => {
  if (!country || typeof country !== "string") return "in";
  const cleaned = country.trim().toLowerCase();
  if (cleaned === "india" || cleaned === "ind") return "in";
  return cleaned.slice(0, 2);
};

/**
 * Extract client IP address from express request, honoring proxies.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const getClientIp = (req) => {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const ips = typeof forwarded === "string" ? forwarded.split(",") : forwarded;
    if (ips.length > 0) return ips[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
};

/**
 * Extract client User-Agent from express request.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const getClientUserAgent = (req) => {
  if (!req) return null;
  return req.headers?.["user-agent"] || null;
};

/**
 * Build Meta normalized user_data object.
 *
 * @param {Object} params
 * @param {string} [params.email]
 * @param {string} [params.phone]
 * @param {string} [params.fullName]
 * @param {string} [params.firstName]
 * @param {string} [params.lastName]
 * @param {string} [params.city]
 * @param {string} [params.state]
 * @param {string} [params.pincode]
 * @param {string} [params.country]
 * @param {string} [params.clientIp]
 * @param {string} [params.clientUserAgent]
 * @param {string} [params.fbp]
 * @param {string} [params.fbc]
 * @returns {Object}
 */
const buildUserData = ({
  email,
  phone,
  fullName,
  firstName,
  lastName,
  city,
  state,
  pincode,
  country,
  clientIp,
  clientUserAgent,
  fbp,
  fbc,
}) => {
  const userData = {};

  // Email
  const normEmail = normalizeEmail(email);
  if (normEmail) {
    const hashed = hashField(normEmail);
    if (hashed) userData.em = [hashed];
  }

  // Phone
  const normPhone = normalizePhone(phone);
  if (normPhone) {
    const hashed = hashField(normPhone);
    if (hashed) userData.ph = [hashed];
  }

  // Names
  let fn = firstName;
  let ln = lastName;
  if (!fn && fullName) {
    const parts = fullName.trim().split(/\s+/);
    fn = parts[0];
    if (parts.length > 1) {
      ln = parts.slice(1).join(" ");
    }
  }

  const normFn = normalizeName(fn);
  if (normFn) {
    const hashed = hashField(normFn);
    if (hashed) userData.fn = [hashed];
  }

  const normLn = normalizeName(ln);
  if (normLn) {
    const hashed = hashField(normLn);
    if (hashed) userData.ln = [hashed];
  }

  // City
  const normCity = normalizeCity(city);
  if (normCity) {
    const hashed = hashField(normCity);
    if (hashed) userData.ct = [hashed];
  }

  // State
  const normState = normalizeState(state);
  if (normState) {
    const hashed = hashField(normState);
    if (hashed) userData.st = [hashed];
  }

  // Pincode / Zip
  const normZip = normalizePostalCode(pincode);
  if (normZip) {
    const hashed = hashField(normZip);
    if (hashed) userData.zp = [hashed];
  }

  // Country
  const normCountry = normalizeCountry(country);
  const hashedCountry = hashField(normCountry);
  if (hashedCountry) {
    userData.country = [hashedCountry];
  }

  // Unhashed Meta Identifiers
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return userData;
};

/**
 * Send an event or batch of events to Meta Conversions API via Graph API.
 * Fail-safe: catches all errors so payment & order workflows are never interrupted.
 *
 * @param {Object} options
 * @param {string} options.eventName - Standard or custom event name (e.g. "Purchase")
 * @param {string} [options.eventId] - Unique event ID for deduplication with browser pixel
 * @param {string} [options.eventSourceUrl] - URL where event occurred
 * @param {Object} options.userData - Built by buildUserData
 * @param {Object} [options.customData] - E-commerce custom payload (value, currency, contents, etc.)
 * @param {string} [options.actionSource="website"] - Action source ("website", "email", etc.)
 * @returns {Promise<{success: boolean, response?: any, error?: string}>}
 */
const sendEvent = async ({
  eventName,
  eventId,
  eventSourceUrl,
  userData = {},
  customData = {},
  actionSource = "website",
}) => {
  const pixelId = process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  if (!accessToken) {
    logger.warn(
      `[META CAPI] Skipping event "${eventName}": META_ACCESS_TOKEN is not configured in environment.`
    );
    return { success: false, error: "META_ACCESS_TOKEN_NOT_CONFIGURED" };
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  const eventPayload = {
    event_name: eventName,
    event_time: currentTimestamp,
    action_source: actionSource,
    user_data: userData,
    custom_data: customData,
  };

  if (eventId) {
    eventPayload.event_id = String(eventId);
  }

  if (eventSourceUrl) {
    eventPayload.event_source_url = eventSourceUrl;
  }

  const requestBody = {
    data: [eventPayload],
  };

  if (testEventCode) {
    requestBody.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;

  try {
    const response = await axios.post(url, requestBody, {
      params: { access_token: accessToken },
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    logger.info(
      `✅ [META CAPI] Event "${eventName}" sent successfully for eventId: ${eventId || "none"}`,
      {
        eventsReceived: response.data?.events_received,
        fbtraceId: response.data?.fbtrace_id,
      }
    );

    return { success: true, response: response.data };
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    logger.error(
      `❌ [META CAPI] Failed to send event "${eventName}" (eventId: ${eventId}):`,
      errorDetails
    );
    return { success: false, error: errorDetails };
  }
};

/**
 * Track Purchase event for an order via Meta Conversions API.
 * Uses atomic flag `metaPurchaseSent` on the order to guarantee single delivery.
 *
 * @param {Object} params
 * @param {Object} params.order - Mongoose Order document or plain object
 * @param {import('express').Request} [params.req] - Optional incoming request
 * @param {Object} [params.metaContext] - Optional context sent from frontend
 * @returns {Promise<boolean>}
 */
const trackPurchase = async ({ order, req, metaContext }) => {
  if (!order || !order.orderId) {
    logger.warn("[META CAPI] Cannot track purchase: invalid order object.");
    return false;
  }

  try {
    // Atomic check-and-set to guarantee this order is only tracked once
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: order.orderId, metaPurchaseSent: { $ne: true } },
      { $set: { metaPurchaseSent: true } },
      { new: true }
    );

    if (!updatedOrder) {
      logger.info(
        `[META CAPI] Purchase event already sent for order ${order.orderId}, skipping duplicate.`
      );
      return false;
    }

    // Extract user info (from order shipping address, guest info, or request)
    const shipping = updatedOrder.shippingAddress || {};
    const guest = updatedOrder.guestInfo || {};
    const email = guest.email || shipping.email || req?.user?.email || null;
    const phone = guest.phone || shipping.phone || null;
    const fullName = shipping.fullName || shipping.name || guest.name || null;

    // Extract network & cookie identifiers
    const clientIp =
      getClientIp(req) ||
      updatedOrder.metaTracking?.clientIp ||
      null;

    const clientUserAgent =
      getClientUserAgent(req) ||
      updatedOrder.metaTracking?.clientUserAgent ||
      null;

    const fbp =
      metaContext?.fbp ||
      req?.cookies?._fbp ||
      updatedOrder.metaTracking?.fbp ||
      null;

    const fbc =
      metaContext?.fbc ||
      req?.cookies?._fbc ||
      updatedOrder.metaTracking?.fbc ||
      null;

    const eventSourceUrl =
      metaContext?.eventSourceUrl ||
      updatedOrder.metaTracking?.eventSourceUrl ||
      (process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/order-confirmation?orderId=${updatedOrder.orderId}`
        : undefined);

    const userData = buildUserData({
      email,
      phone,
      fullName,
      city: shipping.city || shipping.district || null,
      state: shipping.state || null,
      pincode: shipping.pincode || null,
      country: shipping.country || "IN",
      clientIp,
      clientUserAgent,
      fbp,
      fbc,
    });

    // Extract items breakdown
    const contents = Array.isArray(updatedOrder.items)
      ? updatedOrder.items.map((item) => ({
          id: String(item.variantSku || item.sku || item.productId || item.variantId),
          quantity: Number(item.quantity) || 1,
          item_price: Number(item.price) || 0,
        }))
      : [];

    const totalAmount =
      Number(
        updatedOrder.totalAmount ??
        updatedOrder.pricing?.payableAmount ??
        updatedOrder.pricing?.grandTotal ??
        updatedOrder.payableAmount ??
        0
      );

    const customData = {
      currency: "INR",
      value: totalAmount,
      content_type: "product",
      contents,
      num_items: updatedOrder.totalQuantity || contents.reduce((s, i) => s + i.quantity, 0),
      order_id: updatedOrder.orderId,
    };

    const result = await sendEvent({
      eventName: "Purchase",
      eventId: updatedOrder.orderId, // Crucial for deduplication with browser pixel
      eventSourceUrl,
      userData,
      customData,
      actionSource: "website",
    });

    return result.success;
  } catch (err) {
    logger.error(`[META CAPI] Exception in trackPurchase for order ${order.orderId}:`, err);
    return false;
  }
};

module.exports = {
  DEFAULT_PIXEL_ID,
  hashField,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeCity,
  normalizeState,
  normalizePostalCode,
  normalizeCountry,
  getClientIp,
  getClientUserAgent,
  buildUserData,
  sendEvent,
  trackPurchase,
};
