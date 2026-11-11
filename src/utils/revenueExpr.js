/**
 * Net revenue of an order for use in aggregation `$sum`s: total minus what has
 * been refunded so far. Partial refunds keep an order "paid", so revenue
 * queries (which match paymentStatus: "paid") would otherwise count the full
 * amount. A full refund flips the order to "refunded" and it drops out of those
 * queries entirely. totalAmount is in rupees; refundedAmountPaise is in paise
 * and missing on orders that were never refunded.
 */
const NET_REVENUE = {
  $subtract: [
    "$totalAmount",
    { $divide: [{ $ifNull: ["$refundedAmountPaise", 0] }, 100] },
  ],
};

/**
 * Booked sales — the one definition of "a sale" shared by the dashboard and
 * every report. An order is booked when it is placed, not when cash arrives:
 *   - not cancelled or returned, AND
 *   - paid (online, POS or collected COD), OR COD still awaiting collection.
 * Online checkouts that were never paid (payment pending/failed) are not sales;
 * the payment reconciler later cancels them with paymentStatus "failed".
 * The paid part of booked sales is "collected" (paymentStatus: "paid").
 */
const NOT_CANCELLED_OR_RETURNED = { $nin: ["cancelled", "returned"] };

const BOOKED_MATCH = {
  orderStatus: NOT_CANCELLED_OR_RETURNED,
  $or: [
    { paymentStatus: "paid" },
    { paymentMethod: "COD", paymentStatus: "pending" },
  ],
};

/** Query filter: booked orders, optionally narrowed by `extra` (date range…). */
function bookedMatch(extra = {}) {
  // $and keeps BOOKED_MATCH's $or/orderStatus from being overwritten by extra.
  return Object.keys(extra).length > 0
    ? { $and: [extra, BOOKED_MATCH] }
    : { ...BOOKED_MATCH };
}

/** Aggregation expression: true when the current order is booked. */
const IS_BOOKED = {
  $and: [
    { $not: [{ $in: ["$orderStatus", ["cancelled", "returned"]] }] },
    {
      $or: [
        { $eq: ["$paymentStatus", "paid"] },
        {
          $and: [
            { $eq: ["$paymentMethod", "COD"] },
            { $eq: ["$paymentStatus", "pending"] },
          ],
        },
      ],
    },
  ],
};

/** Aggregation expression: true when the order is paid (collected). */
const IS_PAID = { $eq: ["$paymentStatus", "paid"] };

/**
 * Aggregation expression: an online checkout whose payment never completed
 * (pending or failed, any order status). Not a sale and not a customer
 * cancellation — the reconciler auto-cancels these.
 */
const IS_UNPAID_ONLINE = {
  $and: [
    { $ne: ["$paymentMethod", "COD"] },
    { $in: ["$paymentStatus", ["pending", "failed"]] },
  ],
};

module.exports = {
  NET_REVENUE,
  BOOKED_MATCH,
  bookedMatch,
  IS_BOOKED,
  IS_PAID,
  IS_UNPAID_ONLINE,
};
