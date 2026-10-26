const { cacheDelPattern } = require("../../utils/redisCache");
const logger = require("../../utils/logger");

/**
 * Flush every admin dashboard/report cache that derives from order + payment
 * data. Call this after ANY mutation that can change revenue, order counts,
 * status distribution, payment method split or customer spend — i.e. order
 * creation, status changes, mark-as-paid, COD auto-paid on delivery, returns
 * and cancellations, and payment webhooks.
 *
 * Centralised so a new report cache only has to be added in one place, and so
 * mutations can never forget to invalidate (the previous bug: several paths —
 * mark-order-as-paid, COD auto-paid on delivery, order creation and the PhonePe
 * webhook — never flushed anything, leaving the dashboard stale for the full
 * TTL).
 */
async function invalidateOrderReportCaches(reason = "order mutation") {
  try {
    await Promise.all([
      cacheDelPattern("dashboard:*"),
      cacheDelPattern("report:sales-by-product:*"),
      cacheDelPattern("report:customers:*"),
      cacheDelPattern("report:revenue-over-time:*"),
      cacheDelPattern("report:orders-by-status:*"),
      cacheDelPattern("report:returns-cancellations:*"),
      cacheDelPattern("report:payment-method-split:*"),
      cacheDelPattern("admin:orders:status-counts:*"),
    ]);
  } catch (err) {
    logger.error("Order/report cache invalidation failed", {
      reason,
      error: err.message,
    });
  }
}

module.exports = { invalidateOrderReportCaches };
