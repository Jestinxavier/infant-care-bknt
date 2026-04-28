const logger = require("../utils/logger");

const REVALIDATION_TIMEOUT_MS = 5000;

/**
 * Trigger Next.js cache revalidation on the frontend.
 * Fire-and-forget — never throws, so a slow/down frontend never blocks API responses.
 */
const triggerRevalidation = async ({ type, resource, tag } = {}) => {
  const frontendUrl = process.env.FRONTEND_URL;
  const revalidateKey = process.env.NEXT_REVALIDATE_KEY;

  if (!frontendUrl || !revalidateKey) {
    logger.warn("[Revalidation] Missing FRONTEND_URL or NEXT_REVALIDATE_KEY — skipping");
    return;
  }

  const params = new URLSearchParams({ key: revalidateKey });
  if (type) params.append("type", type);
  if (resource) params.append("resource", resource);
  if (tag) params.append("tag", tag);

  const url = `${frontendUrl}/api/revalidate?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVALIDATION_TIMEOUT_MS);

  try {
    logger.info("[Revalidation] Triggering", { url: url.replace(revalidateKey, "***") });
    const response = await fetch(url, { method: "GET", signal: controller.signal });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn("[Revalidation] Non-OK response", { status: response.status, body });
    } else {
      logger.info("[Revalidation] Success", { type, resource, tag });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      logger.warn("[Revalidation] Timed out after 5s", { type, resource, tag });
    } else {
      logger.error("[Revalidation] Failed", { message: err.message, type, resource, tag });
    }
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { triggerRevalidation };
