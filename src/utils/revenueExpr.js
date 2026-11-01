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

module.exports = { NET_REVENUE };
