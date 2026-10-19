const logger = require("../utils/logger");
const {
  getMaintenanceState,
  resolveStaffBypass,
  computeRetryAfter,
} = require("../services/maintenanceService");

const ADMIN_PREFIX = process.env.ADMIN_API_PREFIX || "/admin";

// Never blocked: admin API, health, settings (incl. maintenance state),
// payment webhooks/confirmations and docs.
const EXEMPT_EXACT = new Set([
  "/",
  "/api-docs",
  "/order-confirmation",
  "/razorpay-confirmation",
]);
const EXEMPT_PREFIXES = [
  `/api/v1${ADMIN_PREFIX}`,
  "/api/v1/health",
  "/api/v1/settings",
  "/api/webhooks",
  "/api/webhook",
  "/api/v1/payments/webhook",
  "/api/payments/check",
  "/api-docs",
];

// Read-only public content stays available so cached SSR content and
// staff-bypassed admin previews still render.
const PUBLIC_READ_PREFIXES = [
  "/api/v1/product",
  "/api/v1/category",
  "/api/v1/variants",
  "/api/v1/filter",
  "/api/v1/homepage",
  "/api/v1/footer",
  "/api/v1/faqs",
  "/api/v1/cms",
  "/api/v1/attributes",
];

const matchesPrefix = (path, prefixes) =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const isExempt = (req) => {
  const path = req.path;
  const method = req.method.toUpperCase();

  if (EXEMPT_EXACT.has(path)) return true;
  if (matchesPrefix(path, EXEMPT_PREFIXES)) return true;

  // Dashboard login/refresh must work while the storefront is down.
  if (
    path.startsWith("/api/v1/auth") &&
    req.headers["x-client-type"] === "dashboard"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD") &&
    matchesPrefix(path, PUBLIC_READ_PREFIXES)
  ) {
    return true;
  }

  return false;
};

const maintenanceGuard = async (req, res, next) => {
  try {
    if (req.method === "OPTIONS") return next();
    if (isExempt(req)) return next();

    const state = await getMaintenanceState();
    if (!state.enabled) return next();

    if (await resolveStaffBypass(req)) return next();

    const retryAfter = computeRetryAfter(state.reopenAt);
    res.set("Retry-After", String(retryAfter));

    return res.status(503).json({
      success: false,
      statusCode: 503,
      message: state.message,
      maintenance: {
        enabled: true,
        title: state.title,
        message: state.message,
        reopenAt: state.reopenAt || null,
        retryAfterSeconds: retryAfter,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // The guard must never take the API down.
    logger.error("[Maintenance] Guard error", { message: error.message });
    return next();
  }
};

module.exports = maintenanceGuard;
module.exports.isExempt = isExempt;
