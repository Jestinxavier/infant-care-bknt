/**
 * Stale online-payment reconciler.
 *
 * Stock (and any coupon) is reserved when an order is placed, before the
 * customer pays. Razorpay sends no message when a customer simply closes the
 * payment popup, and a PhonePe "failed" webhook can be missed, so such orders
 * stayed "payment pending" and held that stock forever. This job finds those orders and asks the gateway what really
 * happened:
 *   - paid      → mark the order paid (the webhook was missed)
 *   - failed    → cancel the order and put the stock back
 *   - anything else (still in progress, gateway error) → leave it alone
 *
 * Safety rules (an order is never cancelled on our own guess):
 *   - Only orders still "pending" (never confirmed/shipped/cancelled by anyone).
 *   - Only after the PhonePe payment page has expired (60 min) plus margin.
 *   - Only orders from the last few days, so old stuck orders whose stock an
 *     admin may already have fixed by hand are never touched automatically.
 *   - Every change is an atomic claim on the order's current state, so a
 *     webhook, the redirect and this job racing each other change it once
 *     and restore stock at most once.
 */
const cron = require("node-cron");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const { releaseUnpaidOrderHolds } = require("../utils/orderStockRestore");
const { PAYMENT_METHODS } = require("../../resources/constants");
const logger = require("../utils/logger");

const MINUTE = 60 * 1000;
// PhonePe's payment page expires 60 min after it's created (expireAfter(3600));
// a Razorpay popup left open that long is abandoned too.
const STALE_AFTER_MS = 75 * MINUTE;
// A Razorpay payment still "created" after this long was abandoned midway
// (e.g. on the bank page) and no longer counts as in progress.
const CREATED_PAYMENT_GRACE_MS = 15 * MINUTE;
// A Razorpay order this young with no payment attempt may still have its
// popup opening, so a retry inside this window doesn't release it.
const FRESH_ORDER_GRACE_MS = 30 * 1000;
// Never touch orders older than this automatically (see safety rules).
const MAX_AGE_MS = 3 * 24 * 60 * MINUTE;
const BATCH_LIMIT = 50;

// The PhonePe redirect handler has stored the method in lowercase.
const ONLINE_METHODS = [
  PAYMENT_METHODS.PHONEPE,
  PAYMENT_METHODS.RAZORPAY,
  "phonepe",
  "razorpay",
];

const defaultGateways = () => ({
  phonepeStatus: (orderId) =>
    require("../controllers/payment/phonepeSDK").fetchPhonePeOrderStatus(orderId),
  razorpayPayments: (razorpayOrderId) =>
    require("../controllers/payment/razorpaySDK").fetchRazorpayOrderPayments(
      razorpayOrderId,
    ),
  phonepeMarkPaid: (...args) =>
    require("../controllers/payment/phonepeSDK").markPhonePeOrderPaid(...args),
  razorpayMarkPaid: (...args) =>
    require("../controllers/payment/razorpaySDK").markOrderAsPaid(...args),
});

/** Money is moving: authorized (awaiting capture) or a payment just started. */
const isPaymentInFlight = (payment, now) =>
  payment.status === "authorized" ||
  (payment.status === "created" &&
    now.getTime() - Number(payment.created_at || 0) * 1000 < CREATED_PAYMENT_GRACE_MS);

// Still open: only an unpaid order nobody has moved on from "pending".
const openOrderFilter = (orderId) => ({
  orderId,
  paymentStatus: { $in: ["pending", "failed"] },
  orderStatus: "pending",
});

const invalidateCaches = (reason) => {
  try {
    require("../controllers/admin/orderCacheInvalidation").invalidateOrderReportCaches(
      reason,
    );
  } catch {
    /* cache invalidation is best effort */
  }
};

/** PhonePe says COMPLETED: the same shared path the webhook and redirect use. */
async function markPhonePePaid(order, status, gateways) {
  const updated = await gateways.phonepeMarkPaid(order.orderId, {
    transactionId: status.transactionId,
    rawResponse: status.raw,
    source: "reconciler",
    note: "Payment confirmed by PhonePe status check (webhook missed)",
    // Never confirm an order someone moved on meanwhile
    onlyIfPending: true,
  });
  return Boolean(updated);
}

/**
 * Cancel an unpaid order and give back what it reserved: stock and coupon
 * redemptions. Claims the order atomically first, so it happens at most once
 * even when a webhook, a retry and this job race. Returns false if someone
 * else already changed the order.
 *
 * `resetCart`: reopen the cart if it still belongs to this order, so the
 * customer can check out again (not wanted when they're already retrying).
 */
async function cancelUnpaidOrder(order, { note, gatewayResponse, resetCart = true }) {
  const claimed = await Order.findOneAndUpdate(openOrderFilter(order.orderId), {
    $set: { paymentStatus: "failed", orderStatus: "cancelled" },
    $push: { statusHistory: { status: "cancelled", note } },
  });
  if (!claimed) return false;

  invalidateCaches("Unpaid order released");
  await Payment.findOneAndUpdate(
    { orderId: claimed._id },
    { $set: { status: "failed", phonepeResponse: gatewayResponse } },
  );
  if (resetCart) {
    await Cart.findOneAndUpdate(
      { orderId: claimed._id },
      { $set: { status: "active", completedAt: null }, $unset: { orderId: "" } },
    );
  }
  // `claimed` is the order as it was before the update (items unchanged)
  await releaseUnpaidOrderHolds(claimed);
  return true;
}

/**
 * Ask the gateway about an unpaid order. Verdict "paid", "failed" (safe to
 * cancel), "pending" (money may be moving: do nothing) or "unknown" (can't
 * tell: do nothing). Throws if the gateway can't be reached.
 */
async function gatewayVerdict(order, gateways, now) {
  const method = String(order.paymentMethod || "").toUpperCase();

  if (method === PAYMENT_METHODS.PHONEPE) {
    const status = await gateways.phonepeStatus(order.orderId);
    if (status?.state === "COMPLETED") return { verdict: "paid", status };
    if (status?.state === "FAILED") return { verdict: "failed", raw: status.raw };
    return { verdict: "pending" };
  }

  if (method === PAYMENT_METHODS.RAZORPAY) {
    // Older orders used Razorpay payment links and have no Razorpay order id;
    // we can't ask about those, so leave them to an admin
    if (!order.razorpayOrderId) return { verdict: "unknown" };
    const payments = await gateways.razorpayPayments(order.razorpayOrderId);
    const captured = payments.find((p) => p.status === "captured");
    if (captured) return { verdict: "paid", captured };
    if (payments.some((p) => isPaymentInFlight(p, now))) return { verdict: "pending" };
    // No attempt yet on a brand-new order: its popup may still be opening or
    // open (double tap, second tab), so it can still be paid. Not a failure.
    const ageMs = now.getTime() - new Date(order.createdAt).getTime();
    if (payments.length === 0 && ageMs < FRESH_ORDER_GRACE_MS) return { verdict: "pending" };
    return { verdict: "failed", raw: { payments } };
  }

  return { verdict: "unknown" };
}

/** Record the payment the gateway confirmed. True if the order is now paid. */
async function applyPaid(order, result, gateways) {
  if (result.captured) {
    await gateways.razorpayMarkPaid(order.orderId, result.captured.id, {
      reconciled: true,
      payment: result.captured,
    });
    const after = await Order.findOne({ orderId: order.orderId }).select("paymentStatus").lean();
    return after?.paymentStatus === "paid";
  }
  return markPhonePePaid(order, result.status, gateways);
}

/** Decides and (unless dryRun) applies the outcome for one stale order. */
async function reconcileOrder(order, { gateways, dryRun, now }) {
  const result = await gatewayVerdict(order, gateways, now);
  if (result.verdict === "paid") {
    if (dryRun) return "would-mark-paid";
    return (await applyPaid(order, result, gateways)) ? "marked-paid" : "skipped-changed";
  }
  if (result.verdict === "failed") {
    if (dryRun) return "would-cancel";
    const done = await cancelUnpaidOrder(order, {
      note: "Payment not completed - auto-cancelled, stock released",
      gatewayResponse: result.raw,
    });
    return done ? "cancelled" : "skipped-changed";
  }
  return result.verdict === "pending" ? "left-pending" : "left-unknown";
}

/**
 * Called when a customer taps "Place order" again on the same cart, e.g.
 * after closing the Razorpay popup. Their earlier attempt still holds the
 * stock and coupon, so without this the retry said "out of stock" for the
 * item they had just reserved, or "coupon already used".
 *
 * Returns:
 *   "none"        no earlier unpaid Razorpay attempt; carry on
 *   "released"    earlier attempt was unpaid and is now cancelled; carry on
 *   "paid"        the earlier attempt was actually paid; don't take money twice
 *   "in-progress" a payment on it is still moving; ask the customer to wait
 *   "unknown"     the gateway couldn't be asked; carry on as before
 */
async function releasePreviousAttempt(cart, { gateways = defaultGateways(), now = new Date() } = {}) {
  if (!cart || cart.status !== "checkout" || !cart.orderId) return "none";
  const previous = await Order.findById(cart.orderId).lean();
  if (
    !previous ||
    previous.orderStatus !== "pending" ||
    !["pending", "failed"].includes(previous.paymentStatus)
  ) {
    return "none";
  }
  // PhonePe links stay payable for an hour, so only Razorpay attempts are
  // released on retry (PhonePe ones are left to the scheduled job).
  if (String(previous.paymentMethod || "").toUpperCase() !== PAYMENT_METHODS.RAZORPAY) {
    return "none";
  }

  let result;
  try {
    result = await gatewayVerdict(previous, gateways, now);
  } catch (err) {
    logger.warn("Retry: could not check earlier Razorpay attempt", {
      orderId: previous.orderId,
      message: err.message,
    });
    return "unknown";
  }

  if (result.verdict === "paid") {
    await applyPaid(previous, result, gateways);
    return "paid";
  }
  if (result.verdict === "pending") return "in-progress";
  if (result.verdict !== "failed") return "unknown";

  const released = await cancelUnpaidOrder(previous, {
    note: "Customer placed the order again - earlier unpaid attempt released",
    gatewayResponse: result.raw,
    // The customer is checking out right now; keep the cart in checkout
    resetCart: false,
  });
  if (released) {
    logger.info("Released earlier unpaid attempt on retry", { orderId: previous.orderId });
    return "released";
  }

  // Lost the claim: something changed the order after we asked Razorpay
  // (e.g. the payment webhook marked it paid). Never assume it was released.
  const current = await Order.findById(previous._id).select("paymentStatus orderStatus").lean();
  if (current?.paymentStatus === "paid") return "paid";
  if (current?.orderStatus === "cancelled") return "released"; // a parallel retry released it
  return "in-progress";
}

let running = false;

/**
 * One pass. `dryRun` reports what would happen without changing anything.
 * `maxAgeMs` can be raised for a one-off manual review of older orders.
 */
async function reconcileStalePayments({
  now = new Date(),
  dryRun = false,
  maxAgeMs = MAX_AGE_MS,
  gateways = defaultGateways(),
} = {}) {
  if (running) return { skipped: "already-running", results: [] };
  running = true;
  try {
    const orders = await Order.find({
      paymentMethod: { $in: ONLINE_METHODS },
      paymentStatus: { $in: ["pending", "failed"] },
      orderStatus: "pending",
      createdAt: {
        $lte: new Date(now.getTime() - STALE_AFTER_MS),
        $gte: new Date(now.getTime() - maxAgeMs),
      },
    })
      // Least recently checked first (never-checked ones lead), so orders
      // that stay undecided (still pending, gateway down) rotate instead of
      // filling every batch and starving newer abandoned orders
      .sort({ paymentReconcileCheckedAt: 1, createdAt: 1 })
      .limit(BATCH_LIMIT)
      .lean();

    const results = [];
    for (const order of orders) {
      let outcome;
      try {
        outcome = await reconcileOrder(order, { gateways, dryRun, now });
      } catch (err) {
        // Gateway down or timed out: try again next run, change nothing
        outcome = "error";
        logger.warn("Payment reconciler: could not check order", {
          orderId: order.orderId,
          message: err.message,
        });
      }
      results.push({ orderId: order.orderId, paymentMethod: order.paymentMethod, outcome });
      if (!dryRun) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { paymentReconcileCheckedAt: now } },
          // Bookkeeping, not an order change: keep updatedAt
          { timestamps: false },
        ).catch(() => {});
      }
    }

    const changed = results.filter((r) => ["marked-paid", "cancelled"].includes(r.outcome));
    if (changed.length > 0 || dryRun) {
      logger.info("Payment reconciler run", { dryRun, checked: results.length, results });
    }
    return { results };
  } finally {
    running = false;
  }
}

const startPaymentReconcilerCron = () => {
  if (process.env.PAYMENT_RECONCILE === "off") {
    logger.info("Payment reconciler disabled (PAYMENT_RECONCILE=off)");
    return;
  }
  cron.schedule("*/15 * * * *", () => {
    reconcileStalePayments().catch((err) =>
      logger.error("Payment reconciler failed", { message: err.message }),
    );
  });
  logger.info("Payment reconciler cron scheduled (every 15 min)");
};

module.exports = {
  reconcileStalePayments,
  releasePreviousAttempt,
  startPaymentReconcilerCron,
  STALE_AFTER_MS,
  MAX_AGE_MS,
};
