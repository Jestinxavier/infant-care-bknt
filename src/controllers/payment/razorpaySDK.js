const axios = require("axios");
const crypto = require("crypto");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const Cart = require("../../models/Cart");
const { releaseUnpaidOrderHolds } = require("../../utils/orderStockRestore");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const emailService = require("../../services/emailService");
const logger = require("../../utils/logger");
const {
  invalidateOrderReportCaches,
} = require("../admin/orderCacheInvalidation");

const RAZORPAY_TIMEOUT_MS = 15000;

// Constant-time comparison for hex HMAC signatures.
const safeEqualHex = (expected, received) => {
  if (typeof received !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const razorpayAuthHeader = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials are not configured");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

/**
 * A valid signature only proves the payment belongs to `razorpayOrderId`. Check
 * that this Razorpay order was created for our `order` (and for its amount) so a
 * payment for a cheap order can't be replayed to mark an expensive one as paid.
 * Orders created before razorpayOrderId was persisted are checked against the
 * Razorpay order's receipt + amount instead.
 */
const razorpayOrderBelongsTo = async (order, razorpayOrderId) => {
  if (order.razorpayOrderId) {
    return order.razorpayOrderId === razorpayOrderId;
  }
  const { data } = await axios.get(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`,
    { headers: { Authorization: razorpayAuthHeader() }, timeout: RAZORPAY_TIMEOUT_MS },
  );
  return (
    data?.receipt === order.orderId &&
    Number(data?.amount) === Math.round(order.totalAmount * 100)
  );
};

// Shared Helper: Mark Order as Paid
const markOrderAsPaid = async (orderId, transactionId, rawResponse, req = null) => {
  logger.info(`[RAZORPAY] Marking order ${orderId} as paid with transaction ${transactionId}`);

  const order = await Order.findOne({ orderId });
  if (!order) {
    logger.warn(`[RAZORPAY] Order ${orderId} not found for marking paid`);
    return;
  }

  // Only an order still awaiting payment can be marked paid. Replays (callback +
  // webhook, retried webhooks) must not regress a shipped order to "confirmed"
  // or resend the confirmation email.
  if (!["pending", "failed"].includes(order.paymentStatus)) {
    logger.info(`[RAZORPAY] Order ${orderId} payment already ${order.paymentStatus}; skipping`);
    return;
  }

  // Only a pending order moves to confirmed. If the order was already cancelled
  // (e.g. payment captured after a failure), record the payment but keep it
  // cancelled so an admin can refund it.
  const nextOrderStatus =
    order.orderStatus === "pending" ? "confirmed" : order.orderStatus;
  if (["cancelled", "returned"].includes(order.orderStatus)) {
    logger.error(
      `[RAZORPAY] Payment captured for ${order.orderStatus} order ${orderId} — needs manual refund`,
      { transactionId },
    );
  }

  const updatedOrder = await Order.findOneAndUpdate(
    { orderId, paymentStatus: { $in: ["pending", "failed"] } },
    {
      $set: {
        paymentStatus: "paid",
        orderStatus: nextOrderStatus,
        paymentMethod: PAYMENT_METHODS.RAZORPAY,
        phonepeTransactionId: transactionId, // Set phonepeTransactionId for compatibility with dashboard UI
      },
    },
    { new: true }
  );

  if (updatedOrder) {
    invalidateOrderReportCaches("Razorpay marked paid");
    await Payment.findOneAndUpdate(
      { orderId: updatedOrder._id },
      {
        $set: {
          status: "success",
          transactionId: transactionId,
          phonepeTransactionId: transactionId, // For compatibility
          phonepeResponse: rawResponse, // Store full response for reference
        },
      }
    );

    await Cart.findOneAndUpdate(
      { orderId: updatedOrder._id },
      { $set: { status: "ordered", completedAt: new Date() } }
    );

    const { emitEvent } = require("../../services/socketService");
    emitEvent("newOrder", {
      orderId: updatedOrder.orderId,
      totalAmount: updatedOrder.totalAmount,
      customerName:
        updatedOrder.shippingAddress?.fullName ||
        updatedOrder.shippingAddress?.name ||
        "Customer",
      itemsCount: updatedOrder.totalQuantity,
      createdAt: updatedOrder.createdAt,
    });

    emailService.sendOrderConfirmationEmail(updatedOrder, { onlyOnce: true }).catch((err) =>
      logger.error("❌ [RAZORPAY] Failed to send order confirmation email:", { message: err.message, stack: err.stack })
    );

    // Meta Conversions API (CAPI) Purchase event
    const { trackPurchase } = require("../../services/metaConversionService");
    trackPurchase({ order: updatedOrder, req }).catch((err) =>
      logger.error("❌ [RAZORPAY] Failed to send Meta CAPI purchase event:", err)
    );
  }
};

// Shared Helper: Handle Payment Failure
const handlePaymentFailure = async (orderId, rawResponse) => {
  logger.warn(`[RAZORPAY] Handling payment failure for order ${orderId}`);

  // Claim the transition atomically: only an unpaid, still-open order can fail.
  // A repeated failure (callback + webhook, webhook retries) or a failure for an
  // already-paid order matches nothing, so stock is restored exactly once.
  const order = await Order.findOneAndUpdate(
    {
      orderId,
      paymentStatus: { $in: ["pending", "failed"] },
      orderStatus: { $nin: ["cancelled", "returned"] },
    },
    { $set: { paymentStatus: "failed", orderStatus: "cancelled" } },
  );
  if (!order) {
    logger.info(`[RAZORPAY] Failure for ${orderId} ignored: order missing, paid, or already closed`);
    return;
  }
  invalidateOrderReportCaches("Razorpay payment failed/cancelled");

  await Payment.findOneAndUpdate(
    { orderId: order._id },
    {
      $set: {
        status: "failed",
        phonepeResponse: rawResponse, // Store response for reference
      },
    }
  );

  await Cart.findOneAndUpdate(
    { orderId: order._id },
    {
      $set: { status: "active", completedAt: null },
      $unset: { orderId: "" },
    }
  );

  await releaseUnpaidOrderHolds(order);
};

/**
 * All payment attempts on a Razorpay order, for background reconciliation.
 * Each item has a status: created, authorized, captured, refunded or failed.
 */
const fetchRazorpayOrderPayments = async (razorpayOrderId) => {
  const { data } = await axios.get(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
    { headers: { Authorization: razorpayAuthHeader() }, timeout: RAZORPAY_TIMEOUT_MS },
  );
  return Array.isArray(data?.items) ? data.items : [];
};

// Initiate payment for website checkout via Razorpay Orders API
const initiatePayment = async ({ orderId, amount }) => {
  try {
    const order = await Order.findOne({ orderId }).lean();
    if (!order) throw new Error("INVALID_ORDER");

    const expectedAmount = Math.round(order.totalAmount * 100);
    if (expectedAmount !== amount) {
      throw new Error(`AMOUNT_MISMATCH: expected ${expectedAmount}, got ${amount}`);
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error("Razorpay API credentials are not configured");
    }

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const customerName = order.shippingAddress?.fullName || order.shippingAddress?.name || order.guestInfo?.name || "Customer";
    const customerEmail = order.guestInfo?.email || order.shippingAddress?.email || "";
    const customerPhone = order.guestInfo?.phone || order.shippingAddress?.phone || "";

    const payload = {
      amount, // in paise
      currency: "INR",
      receipt: orderId,
      notes: {
        orderId: orderId,
      },
    };

    logger.info("[RAZORPAY] Creating Razorpay order", { orderId, amount });

    const response = await axios.post("https://api.razorpay.com/v1/orders", payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      timeout: RAZORPAY_TIMEOUT_MS,
    });

    logger.info("[RAZORPAY] Razorpay order created", { orderId, razorpayOrderId: response.data.id });
    await Order.updateOne(
      { orderId },
      { $set: { razorpayOrderId: response.data.id } },
    );
    return {
      razorpayOrderId: response.data.id,
      amount: response.data.amount,
      currency: response.data.currency,
      key: keyId,
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone,
      },
    };
  } catch (err) {
    logger.error("[RAZORPAY] initiatePayment failed:", err.response?.data || err.message);
    throw err;
  }
};

// Redirect callback handler
const checkOrderStatus = async (req, res) => {
  logger.info("[RAZORPAY] checkOrderStatus redirect callback received", { query: req.query });
  try {
    const {
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
      orderId,
    } = req.query;

    if (!orderId) {
      return res.redirect(`${process.env.FRONTEND_URL}/order-confirmation?status=failed&error=missing_order_id`);
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new Error("RAZORPAY_KEY_SECRET is not configured");
    }

    // Verify callback signature
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_payment_link_id}|${razorpay_payment_link_reference_id}|${razorpay_payment_link_status}|${razorpay_payment_id}`)
      .digest("hex");

    // The signature covers reference_id, not the separate `orderId` query param,
    // so the two must match or a valid callback could be replayed for another order.
    const isSignatureValid =
      safeEqualHex(expectedSignature, razorpay_signature) &&
      razorpay_payment_link_reference_id === orderId;

    if (!isSignatureValid) {
      logger.error("[RAZORPAY] Callback signature verification failed", { orderId });
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}&error=invalid_signature`
      );
    }

    if (razorpay_payment_link_status === "paid") {
      await markOrderAsPaid(orderId, razorpay_payment_id, req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=success&orderId=${encodeURIComponent(orderId)}`
      );
    } else if (razorpay_payment_link_status === "cancelled" || razorpay_payment_link_status === "expired") {
      await handlePaymentFailure(orderId, req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}`
      );
    } else {
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=pending&orderId=${encodeURIComponent(orderId)}`
      );
    }
  } catch (error) {
    logger.error("[RAZORPAY] Error in checkOrderStatus redirect:", error);
    const orderId = req.query?.orderId;
    const fallback = orderId
      ? `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
      : `${process.env.FRONTEND_URL}/order-confirmation?status=failed`;
    return res.redirect(fallback);
  }
};

// Signature verification endpoint handler
const verifyPaymentSignature = async (req, res) => {
  logger.info("[RAZORPAY] verifyPaymentSignature received", { body: req.body });
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing required signature verification parameters",
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new Error("RAZORPAY_KEY_SECRET is not configured");
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // A bad signature proves nothing about the order, so it must not change
    // state: this endpoint is public, and treating it as a payment failure let
    // anyone cancel any order (and restore its stock) with a garbage signature.
    if (!safeEqualHex(expectedSignature, razorpay_signature)) {
      logger.error("[RAZORPAY] Signature verification failed", { orderId });
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed",
      });
    }

    const order = await Order.findOne({ orderId })
      .select("orderId razorpayOrderId totalAmount")
      .lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (!(await razorpayOrderBelongsTo(order, razorpay_order_id))) {
      logger.error("[RAZORPAY] Payment does not belong to order", {
        orderId,
        razorpay_order_id,
      });
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed",
      });
    }

    // Mark as paid
    await markOrderAsPaid(orderId, razorpay_payment_id, req.body, req);

    return res.status(200).json({
      success: true,
      message: "Payment verified and order confirmed successfully",
    });
  } catch (error) {
    logger.error("[RAZORPAY] Error in verifyPaymentSignature:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during payment verification",
    });
  }
};

// Webhook listener
const razorpayWebhook = async (req, res) => {
  logger.info("📥 Razorpay webhook received", {
    timestamp: new Date().toISOString(),
    hasSignature: !!req.headers["x-razorpay-signature"],
    hasBody: !!req.rawBody,
  });

  try {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !req.rawBody) {
      logger.error("❌ Razorpay webhook: Missing signature or body");
      return res.status(400).send("INVALID CALLBACK");
    }

    // Never process an unverified webhook: without the secret anyone could post
    // a forged "order.paid" event.
    if (!webhookSecret) {
      logger.error("❌ Razorpay webhook: RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(500).send("WEBHOOK NOT CONFIGURED");
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.rawBody)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, signature)) {
      logger.error("❌ Razorpay webhook: Signature verification failed");
      return res.status(400).send("INVALID CALLBACK");
    }

    const eventData = JSON.parse(req.rawBody);
    const event = eventData.event;
    const payload = eventData.payload;

    logger.info(`📋 Razorpay webhook event: ${event}`);

    if ((event === "order.paid" || event === "payment_link.paid") && (payload.order || payload.payment_link)) {
      const orderEntity = payload.order?.entity || payload.payment_link?.entity;
      const orderId = orderEntity.receipt || orderEntity.reference_id || orderEntity.notes?.orderId;
      const transactionId = payload.payment?.entity?.id || orderEntity.id;

      const order = await Order.findOne({ orderId });
      if (!order) {
        logger.warn(`⚠️ Razorpay webhook: Order not found: ${orderId}`);
        return res.status(200).send("OK");
      }

      if (order.paymentStatus === "paid") {
        logger.info(`ℹ️ Razorpay webhook: Order already paid: ${orderId}`);
        return res.status(200).send("OK");
      }

      await markOrderAsPaid(orderId, transactionId, eventData);
    } else if ((event === "payment_link.cancelled" || event === "payment_link.expired") && payload.payment_link) {
      const paymentLink = payload.payment_link.entity;
      const orderId = paymentLink.reference_id;

      const order = await Order.findOne({ orderId });
      if (!order) {
        logger.warn(`⚠️ Razorpay webhook: Order not found: ${orderId}`);
        return res.status(200).send("OK");
      }

      if (order.paymentStatus === "paid") {
        logger.warn(`⚠️ Razorpay webhook: Try to fail order that is already marked paid: ${orderId}`);
        return res.status(200).send("OK");
      }

      await handlePaymentFailure(orderId, eventData);
    }

    return res.status(200).send("OK");
  } catch (err) {
    logger.error("Razorpay webhook processing error:", err.message, err.stack);
    return res.status(500).send("Internal Server Error");
  }
};

// Initiate refund via Razorpay Refunds API
const initiateRefund = async (orderId, amountPaise, reason) => {
  logger.info("[RAZORPAY] initiateRefund called", { orderId, amountPaise, reason });

  const order = await Order.findOne({ orderId }).lean();
  if (!order) throw new Error("Order not found");

  const paymentId = order.phonepeTransactionId;
  if (!paymentId) throw new Error("No active payment ID found for this order");

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials are not configured");
  }

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  const payload = {
    amount: amountPaise,
    speed: "normal",
    notes: {
      reason: reason || "Admin refund",
    },
  };

  const response = await axios.post(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    timeout: RAZORPAY_TIMEOUT_MS,
  });

  const refundData = response.data;
  logger.info("[RAZORPAY] Refund initiated successfully", { refundId: refundData.id, status: refundData.status });

  // Map Razorpay refund status to PhonePe compatible enum values
  let mappedState = "PENDING";
  if (refundData.status === "processed") mappedState = "COMPLETED";
  else if (refundData.status === "failed") mappedState = "FAILED";

  return {
    refundId: refundData.id,
    state: mappedState,
    amount: refundData.amount,
  };
};

// Query status of a previously initiated refund
const getRefundStatus = async (refundId) => {
  logger.info("[RAZORPAY] getRefundStatus called", { refundId });

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials are not configured");
  }

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  // Find the order that matches this refundId
  const order = await Order.findOne({ refundId }).lean();
  if (!order) throw new Error("Refund not found in order database");

  const paymentId = order.phonepeTransactionId;
  if (!paymentId) throw new Error("No active payment ID found for this order");

  const response = await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}/refunds/${refundId}`, {
    headers: {
      Authorization: authHeader,
    },
    timeout: RAZORPAY_TIMEOUT_MS,
  });

  const refundData = response.data;
  logger.info("[RAZORPAY] Refund status response", { refundId: refundData.id, status: refundData.status });

  let mappedState = "PENDING";
  if (refundData.status === "processed") mappedState = "COMPLETED";
  else if (refundData.status === "failed") mappedState = "FAILED";

  return {
    merchantId: keyId,
    merchantRefundId: refundId,
    state: mappedState,
    amount: refundData.amount,
    paymentDetails: [],
  };
};

module.exports = {
  initiatePayment,
  checkOrderStatus,
  verifyPaymentSignature,
  markOrderAsPaid,
  handlePaymentFailure,
  fetchRazorpayOrderPayments,
  razorpayWebhook,
  initiateRefund,
  getRefundStatus,
};
