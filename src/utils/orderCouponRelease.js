const Coupon = require("../models/Coupon");
const logger = require("./logger");

/**
 * Give back the coupon redemptions an UNPAID order consumed at checkout.
 *
 * Placing an order increments each coupon's usageCount before payment. If the
 * customer never pays (closed the Razorpay popup, payment failed), the order
 * is cancelled but the redemption stayed used, so a single-use coupon (e.g. an
 * abandoned-cart COMEBACK code) was refused when the customer tried again.
 *
 * Call this only once per order, right after atomically claiming its
 * cancellation, and never for orders that were paid.
 */
async function releaseOrderCoupons(order) {
  const ids = (order?.coupons?.length ? order.coupons : [order?.coupon])
    .map((c) => c?.couponId)
    .filter(Boolean);
  if (ids.length === 0) return;

  try {
    await Coupon.bulkWrite(
      ids.map((id) => ({
        updateOne: {
          // Never below zero, even if counts were edited by hand
          filter: { _id: id, usageCount: { $gt: 0 } },
          update: { $inc: { usageCount: -1 } },
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    // A coupon count is not worth failing the cancellation over
    logger.error("Failed to release coupon usage for unpaid order", {
      orderId: order.orderId,
      message: err.message,
    });
  }
}

module.exports = { releaseOrderCoupons };
