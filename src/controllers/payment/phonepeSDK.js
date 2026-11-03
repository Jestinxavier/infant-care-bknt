const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  PhonePeException,
  RefundRequest,
} = require("pg-sdk-node");

const { phonePeConfig } = require("../../config/phonepeConfig");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const Cart = require("../../models/Cart");
const { restoreOrderStock } = require("../../utils/orderStockRestore");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const emailService = require("../../services/emailService");
const logger = require("../../utils/logger");
const {
  invalidateOrderReportCaches,
} = require("../admin/orderCacheInvalidation");
const { logError } = require("../../utils/errorLogger");
const { logPhonePeInfo } = logger;
const { wlog } = require("../../utils/webhookLogger");
const withTimeout = require("../../utils/withTimeout");

const PHONEPE_TIMEOUT_MS = 15000; // 15s — PhonePe SLA is well under this

const client = StandardCheckoutClient.getInstance(
  phonePeConfig.credentials.clientId,
  phonePeConfig.credentials.clientSecret,
  phonePeConfig.credentials.clientVersion,
  phonePeConfig.env,
);

/**
 * Initiate payment for website checkout (Standard Checkout).
 * Uses StandardCheckoutPayRequest per PhonePe docs; CreateSdkOrderRequest is for mobile SDK only.
 */
const initiatePayment = async ({ orderId, amount }) => {
  try {
    const order = await Order.findOne({ orderId }).lean();
    if (!order) throw new Error("INVALID_ORDER");
    const expectedAmount = Math.round(order.totalAmount * 100);
    if (expectedAmount !== amount) throw new Error(`AMOUNT_MISMATCH: expected ${expectedAmount}, got ${amount}`);

    const redirectToken = jwt.sign(
      { orderId, purpose: "PHONEPE_REDIRECT" },
      phonePeConfig.credentials.redirectSecret,
      { expiresIn: "1h" },
    );

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(orderId)
      .amount(amount)
      .redirectUrl(phonePeConfig.redirectUrl(redirectToken, orderId))
      .expireAfter(3600)
      .message("Complete payment")
      .build();

    const response = await withTimeout(
      client.pay(request),
      PHONEPE_TIMEOUT_MS,
      "PhonePe pay"
    );
    logPhonePeInfo("Payment initiated", { orderId });
    return { redirectUrl: response.redirectUrl };
  } catch (err) {
    if (err instanceof PhonePeException) {
      void logError(err, {
        source: "payment/phonepeSDK.initiatePayment",
        statusCode: err.httpStatusCode || 502,
        metadata: {
          orderId,
          amount,
          gateway: "phonepe",
          stage: "initiate_payment",
          code: err.code,
          data: err.data,
        },
      });
      throw new Error("PHONEPE_INITIATION_FAILED");
    }
    void logError(err, {
      source: "payment/phonepeSDK.initiatePayment",
      statusCode: 500,
      metadata: {
        orderId,
        amount,
        gateway: "phonepe",
        stage: "initiate_payment",
      },
    });
    throw err;
  }
};

/**
 * Order confirmation / redirect handler.
 * PhonePe redirects here after payment with orderId (and optionally token) in query.
 * We call getOrderStatus, update DB, then redirect to frontend with status and orderId.
 */
const checkOrderStatus = async (req, res) => {
  logPhonePeInfo("PhonePe order confirmation received", { query: req.query });
  try {
    let { orderId, token } = req.query;

    // PhonePe may not preserve our query params on redirect; derive orderId from token if missing
    if (!orderId && token) {
      try {
        const decoded = jwt.verify(
          token,
          phonePeConfig.credentials.redirectSecret,
          {
            maxAge: "1h",
          },
        );
        if (decoded?.orderId) orderId = decoded.orderId;
      } catch {
        // token invalid or expired; fall through to missing orderId handling
      }
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing order ID",
      });
    }

    if (token) {
      try {
        jwt.verify(token, phonePeConfig.credentials.redirectSecret, {
          maxAge: "1h",
        });
      } catch {
        return res.redirect(
          `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}&error=invalid_redirect`,
        );
      }
    }

    let response;
    try {
      response = await withTimeout(
        client.getOrderStatus(orderId),
        PHONEPE_TIMEOUT_MS,
        "PhonePe getOrderStatus"
      );
    } catch (err) {
      if (err instanceof PhonePeException) {
        void logError(err, {
          source: "payment/phonepeSDK.checkOrderStatus",
          statusCode: err.httpStatusCode || 502,
          metadata: {
            orderId,
            gateway: "phonepe",
            stage: "get_order_status",
            code: err.code,
            data: err.data,
          },
        });
        return res.redirect(
          `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}`,
        );
      }
      void logError(err, {
        source: "payment/phonepeSDK.checkOrderStatus",
        statusCode: 500,
        metadata: {
          orderId,
          gateway: "phonepe",
          stage: "get_order_status",
        },
      });
      throw err;
    }

    logPhonePeInfo("PhonePe order status received", { orderId, state: response?.state });

    const state = response?.state;
    const paymentDetails = response?.paymentDetails ?? [];

    if (state === "COMPLETED") {
      const order = await Order.findOne({ orderId }).lean();
      if (order && order.paymentStatus !== "paid") {
        const paymentAttempt =
          Array.isArray(paymentDetails) && paymentDetails.length
            ? paymentDetails[0]
            : null;
        const transactionId =
          paymentAttempt?.transactionId ??
          paymentAttempt?.transaction_id ??
          null;

        await Order.findOneAndUpdate(
          { orderId },
          {
            $set: {
              paymentStatus: "paid",
              orderStatus: "confirmed",
              paymentMethod: PAYMENT_METHODS.PHONEPE,
              ...(transactionId && { phonepeTransactionId: transactionId }),
            },
          },
        );
        const updatedOrder = await Order.findOne({ orderId }).lean();
        if (updatedOrder) {
          invalidateOrderReportCaches("PhonePe callback paid");
          await Payment.findOneAndUpdate(
            { orderId: updatedOrder._id },
            {
              $set: {
                status: "success",
                transactionId: transactionId,
                phonepeTransactionId: transactionId,
                phonepeResponse: response,
              },
            },
          );
          await Cart.findOneAndUpdate(
            { orderId: updatedOrder._id },
            { $set: { status: "ordered", completedAt: new Date() } },
          );
          emailService.sendOrderConfirmationEmail(updatedOrder, { onlyOnce: true }).catch((err) =>
            logger.error("❌ Failed to send order confirmation email (redirect):", { message: err.message, stack: err.stack })
          );

          // Meta Conversions API (CAPI) Purchase event
          const { trackPurchase } = require("../../services/metaConversionService");
          trackPurchase({ order: updatedOrder, req }).catch((err) =>
            logger.error("❌ [PHONEPE] Failed to send Meta CAPI purchase event (redirect):", err)
          );
        }
      }
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=success&orderId=${encodeURIComponent(orderId)}`,
      );
    }

    if (state === "FAILED") {
      await Order.findOneAndUpdate(
        { orderId, paymentStatus: { $ne: "paid" } },
        { $set: { paymentStatus: "failed", paymentMethod: "phonepe" } },
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}`,
      );
    }

    if (state === "PENDING") {
      await Order.findOneAndUpdate(
        { orderId, paymentStatus: { $ne: "paid" } },
        { $set: { paymentStatus: "pending", paymentMethod: "phonepe" } },
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=pending&orderId=${encodeURIComponent(orderId)}`,
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`,
    );
  } catch (error) {
    void logError(error, {
      source: "payment/phonepeSDK.checkOrderStatus",
      statusCode: error.statusCode || 500,
      metadata: {
        orderId: req.query?.orderId || null,
        gateway: "phonepe",
        stage: "redirect_handler",
      },
    });
    const orderId = req.query?.orderId;
    const fallback = orderId
      ? `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
      : `${process.env.FRONTEND_URL}/order-confirmation?status=failed`;
    return res.redirect(fallback);
  }
};

/**
 * Manual endpoint to check and update payment status
 * Can be called by admin or as a fallback if webhook fails
 */
const manualCheckPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findOne({ orderId }).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Return current status
    return res.status(200).json({
      success: true,
      order: {
        orderId: order.orderId,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        phonepeTransactionId: order.phonepeTransactionId,
        paymentMethod: order.paymentMethod,
      },
      message:
        "Note: This endpoint shows current database status. If payment was completed but status is still pending, the webhook may not have been called. Check server logs for webhook activity.",
    });
  } catch (err) {
    void logError(err, {
      source: "payment/phonepeSDK.manualCheckPaymentStatus",
      req,
      statusCode: err.statusCode || 500,
      metadata: {
        orderId: req.params?.orderId || null,
        gateway: "phonepe",
        stage: "manual_status_check",
      },
    });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
          });
  }
};

const phonepeWebhook = async (req, res) => {
  wlog("HANDLER_ENTERED", {
    hasAuth: !!req.headers["authorization"],
    hasRawBody: !!req.rawBody,
    bodyLength: req.rawBody?.length ?? 0,
  });
  logger.info("📥 PhonePe webhook received", {
    timestamp: new Date().toISOString(),
    hasAuth: !!req.headers["authorization"],
    hasBody: !!req.rawBody,
    bodyLength: req.rawBody?.length,
  });

  try {
    const authorizationHeader = req.headers["authorization"];

    if (!authorizationHeader || !req.rawBody) {
      wlog("REJECTED_MISSING_AUTH_OR_BODY", {
        hasAuth: !!authorizationHeader,
        hasBody: !!req.rawBody,
      });
      void logError(new Error("PhonePe webhook: Missing authorization or body"), {
        source: "payment/phonepeSDK.phonepeWebhook",
        req,
        statusCode: 400,
        metadata: {
          gateway: "phonepe",
          stage: "webhook_auth_validation",
          hasAuth: !!authorizationHeader,
          hasBody: !!req.rawBody,
        },
      });
      return res.status(400).send("INVALID CALLBACK");
    }

    /* ---------------------------------------------------- */
    /* 2. Validate callback authenticity (MANDATORY)        */
    let callbackResponse;
    try {
      callbackResponse = client.validateCallback(
        phonePeConfig.credentials.username,
        phonePeConfig.credentials.password,
        authorizationHeader,
        req.rawBody,
      );
      wlog("VALIDATION_PASSED");
    } catch (err) {
      if (err instanceof PhonePeException) {
        const errorData = {
          code: err.code,
          httpStatusCode: err.httpStatusCode,
          message: err.message,
          data: err.data,
        };
        wlog("VALIDATION_FAILED", errorData);
        void logError(err, {
          source: "payment/phonepeSDK.phonepeWebhook",
          req,
          statusCode: err.httpStatusCode || 400,
          metadata: {
            gateway: "phonepe",
            stage: "validate_callback",
            ...errorData,
          },
        });
        return res.status(400).send("INVALID CALLBACK");
      }
      wlog("VALIDATION_UNEXPECTED_ERROR", { message: err.message });
      void logError(err, {
        source: "payment/phonepeSDK.phonepeWebhook",
        req,
        statusCode: 500,
        metadata: {
          gateway: "phonepe",
          stage: "validate_callback",
        },
      });
      throw err;
    }

    const { type, payload } = callbackResponse;
    const merchantOrderId =
      payload.merchantOrderId ?? payload.originalMerchantOrderId;

    wlog("PAYLOAD_PARSED", {
      type,
      merchantOrderId,
      hasPaymentDetails: !!payload.paymentDetails,
    });
    logger.info("📋 PhonePe webhook payload", {
      type,
      merchantOrderId,
      hasPaymentDetails: !!payload.paymentDetails,
    });

    if (!merchantOrderId) {
      wlog("REJECTED_NO_ORDER_ID");
      void logError(new Error("PhonePe webhook payload missing merchantOrderId"), {
        source: "payment/phonepeSDK.phonepeWebhook",
        req,
        statusCode: 400,
        metadata: {
          gateway: "phonepe",
          stage: "parse_webhook_payload",
          eventType: type || null,
          hasPaymentDetails: !!payload.paymentDetails,
        },
      });
      return res.status(200).send("OK");
    }

    const order = await Order.findOne({ orderId: merchantOrderId });
    if (!order) {
      wlog("ORDER_NOT_FOUND", { merchantOrderId });
      void logError(new Error("PhonePe webhook order not found"), {
        source: "payment/phonepeSDK.phonepeWebhook",
        req,
        statusCode: 404,
        metadata: {
          gateway: "phonepe",
          stage: "lookup_order",
          merchantOrderId,
          eventType: type || null,
        },
      });
      return res.status(200).send("OK");
    }

    if (order.paymentStatus === "paid") {
      wlog("ALREADY_PAID", { merchantOrderId });
      logger.info(`ℹ️ PhonePe webhook: Order already paid: ${merchantOrderId}`);
      return res.status(200).send("OK");
    }

    const isOrderCompleted =
      type === "CHECKOUT_ORDER_COMPLETED" ||
      type === "checkout.order.completed";

    if (isOrderCompleted) {
      wlog("PROCESSING_COMPLETED", { merchantOrderId });
      const paymentAttempt =
        Array.isArray(payload.paymentDetails) && payload.paymentDetails.length
          ? payload.paymentDetails[0]
          : null;

      const transactionId =
        paymentAttempt?.transactionId ??
        paymentAttempt?.transaction_id ??
        payload?.transactionId ??
        null;

      const updatedOrder = await Order.findOneAndUpdate(
        { orderId: merchantOrderId },
        {
          $set: {
            paymentStatus: "paid",
            orderStatus: "confirmed",
            paymentMethod: PAYMENT_METHODS.PHONEPE,
            phonepeTransactionId: transactionId,
          },
        },
        { new: true }, // returns updated document ̰
      );

      // Update Payment record with transaction ID and status
      await Payment.findOneAndUpdate(
        { orderId: updatedOrder._id },
        {
          $set: {
            status: "success",
            transactionId: transactionId,
            phonepeTransactionId: transactionId,
            phonepeResponse: payload, // Store full response for reference
          },
        },
        { new: true },
      );

      wlog("ORDER_MARKED_PAID", {
        merchantOrderId,
        transactionId,
        paymentStatus: updatedOrder.paymentStatus,
        orderStatus: updatedOrder.orderStatus,
      });
      invalidateOrderReportCaches("PhonePe webhook paid");
      const successLog = {
          transactionId,
          orderId: updatedOrder._id,
          paymentStatus: updatedOrder.paymentStatus,
          orderStatus: updatedOrder.orderStatus,
          payload: JSON.stringify(payload).substring(0, 200), // Log first 200 chars
      };
      logger.info(
        `✅ PhonePe payment successful for order ${merchantOrderId}`,
        successLog,
      );
      logPhonePeInfo(`Payment successful for order ${merchantOrderId}`, successLog);

      await Cart.findOneAndUpdate(
        { orderId: updatedOrder._id },
        { $set: { status: "ordered", completedAt: new Date() } },
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
        logger.error("❌ Failed to send order confirmation email (webhook):", { message: err.message, stack: err.stack })
      );

      // Meta Conversions API (CAPI) Purchase event
      const { trackPurchase } = require("../../services/metaConversionService");
      trackPurchase({ order: updatedOrder, req }).catch((err) =>
        logger.error("❌ [PHONEPE] Failed to send Meta CAPI purchase event (webhook):", err)
      );
    } else if (
      type === "CHECKOUT_ORDER_FAILED" ||
      type === "checkout.order.failed"
    ) {
      wlog("PROCESSING_FAILED", { merchantOrderId });
      // Claim the transition atomically so a retried FAILED webhook (or one that
      // races another failure path) restores stock exactly once.
      const failedOrder = await Order.findOneAndUpdate(
        {
          orderId: merchantOrderId,
          paymentStatus: { $in: ["pending", "failed"] },
          orderStatus: { $nin: ["cancelled", "returned"] },
        },
        { $set: { paymentStatus: "failed", orderStatus: "cancelled" } },
      );
      if (!failedOrder) {
        wlog("FAILED_ALREADY_PROCESSED", { merchantOrderId });
        return res.status(200).send("OK");
      }
      invalidateOrderReportCaches("PhonePe webhook failed/cancelled");

      // Update Payment record
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: {
            status: "failed",
            phonepeResponse: payload, // Store failure response for reference
          },
        },
      );

      const failLog = {
        orderId: order._id,
        payload: JSON.stringify(payload),
      };
      void logError(new Error(`Payment failed for order ${merchantOrderId}`), {
        source: "payment/phonepeSDK.phonepeWebhook",
        req,
        statusCode: 400,
        metadata: {
          gateway: "phonepe",
          stage: "checkout_order_failed",
          merchantOrderId,
          eventType: type,
          ...failLog,
        },
      });
      logPhonePeInfo(`Payment failed for order ${merchantOrderId}`, failLog);

      await Cart.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: { status: "active", completedAt: null },
          $unset: { orderId: "" },
        },
      );

      await restoreOrderStock(order);
    } else {
      wlog("UNHANDLED_EVENT_TYPE", { type, merchantOrderId });
    }

    wlog("RESPONDED_OK", { merchantOrderId });
    return res.status(200).send("OK");
  } catch (err) {
    wlog("CRASHED", { message: err.message });
    void logError(err, {
      source: "payment/phonepeSDK.phonepeWebhook",
      req,
      statusCode: 500,
      metadata: {
        gateway: "phonepe",
        stage: "webhook_crash",
        bodyLength: req.rawBody?.length || 0,
      },
    });
    // Don't touch the order here. This handler can run before the callback was
    // authenticated (validateCallback rethrows unexpected errors) or after a
    // successful payment was already recorded, so cancelling based on the raw
    // body would let a forged request cancel any order, or cancel a paid one.
    // A 500 makes PhonePe retry the webhook; orders that never get a valid
    // callback can be reconciled with the admin payment check
    // (GET /api/payments/check/:orderId).
    return res.status(500).send("WEBHOOK PROCESSING FAILED");
  }
};

// A refund lock older than this is treated as abandoned (e.g. the process died
// mid-request) so the order isn't blocked from refunds forever.
const REFUND_LOCK_TTL_MS = 5 * 60 * 1000;

const releaseRefundLock = (orderObjectId) =>
  Order.updateOne(
    { _id: orderObjectId },
    { $set: { refundLockedAt: null } },
  ).catch((err) =>
    logger.error("❌ [initiateRefund] Failed to release refund lock", {
      orderObjectId,
      message: err.message,
    }),
  );

/**
 * Initiate a (full or partial) refund for a paid PhonePe or Razorpay order.
 * @param {object} req - Express request: body = { orderId, refundAmount (in paise, optional; defaults to the amount not yet refunded) }
 * @param {object} res - Express response
 */
const initiateRefund = async (req, res) => {
  const { orderId, refundAmount, reason } = req.body;

  logger.info("📤 [initiateRefund] Refund request received", {
    orderId,
    refundAmount,
    reason,
    timestamp: new Date().toISOString(),
  });

  // Set while this request holds the refund lock and must release it on error.
  let lockedOrderId = null;

  try {
    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!orderId) {
      logger.warn("⚠️ [initiateRefund] Missing orderId in request body");
      return res
        .status(400)
        .json({ success: false, message: "orderId is required" });
    }

    // ── 2. Order lookup ──────────────────────────────────────────────────────
    // Detail pages link by Mongo `_id`, while older callers use the custom
    // human-facing `orderId`. Accept both so refunds work from either route.
    const rawOrderId = String(orderId).trim();
    const orderQuery = /^[a-f\d]{24}$/i.test(rawOrderId)
      ? { $or: [{ _id: rawOrderId }, { orderId: rawOrderId }] }
      : { orderId: rawOrderId };
    const order = await Order.findOne(orderQuery).lean();
    if (!order) {
      logger.warn(`⚠️ [initiateRefund] Order not found in DB: ${orderId}`);
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    logger.info("📋 [initiateRefund] Order found", {
      orderId,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      totalAmount: order.totalAmount,
      refundedAmountPaise: order.refundedAmountPaise,
      phonepeTransactionId: order.phonepeTransactionId,
    });

    // ── 3. Eligibility checks (both gateways) ────────────────────────────────
    const isRazorpay = order.paymentMethod === "RAZORPAY";
    if (!isRazorpay && order.paymentMethod !== "PHONEPE") {
      logger.warn(
        `⚠️ [initiateRefund] Refund rejected – unsupported payment method: ${order.paymentMethod}`,
        { orderId },
      );
      return res.status(400).json({
        success: false,
        message: "Refund is not supported for this payment method",
      });
    }

    if (order.paymentStatus !== "paid") {
      logger.warn(
        `⚠️ [initiateRefund] Refund rejected – invalid payment status: ${order.paymentStatus}`,
        { orderId },
      );
      return res.status(400).json({
        success: false,
        message: `Cannot refund order with payment status: ${order.paymentStatus}`,
      });
    }

    // ── 4. Amount validation ─────────────────────────────────────────────────
    // CONTRACT: The dashboard sends refundAmount already in PAISE
    //   (refund-dialog.tsx: amountPaise = Math.round(parsedAmount * 100))
    // So we must NOT multiply by 100 here — use the value as-is.
    const orderAmountPaise = Math.round(order.totalAmount * 100); // totalAmount stored in rupees
    const alreadyRefundedPaise = Math.max(
      0,
      Number(order.refundedAmountPaise) || 0,
    );
    const remainingPaise = orderAmountPaise - alreadyRefundedPaise;

    // Use incoming paise directly; if not provided, refund whatever is left
    const amountToRefund = refundAmount
      ? Math.round(Number(refundAmount)) // already in paise from dashboard
      : remainingPaise;

    logger.info("📋 [initiateRefund] Refund amount resolved", {
      orderId,
      orderTotalRupees: order.totalAmount,
      orderAmountPaise,
      alreadyRefundedPaise,
      remainingPaise,
      requestedRefundAmountPaise:
        refundAmount ?? "(not provided — refund remaining amount)",
      amountToRefundPaise: amountToRefund,
    });

    if (
      !Number.isFinite(amountToRefund) ||
      amountToRefund < 1 ||
      amountToRefund > remainingPaise
    ) {
      logger.warn(
        `⚠️ [initiateRefund] Refund rejected – amount out of range: ${amountToRefund} paise (remaining: ${remainingPaise} paise)`,
        { orderId, orderAmountPaise, alreadyRefundedPaise },
      );
      return res.status(400).json({
        success: false,
        message: `Invalid refund amount. Must be between ₹0.01 and ₹${(remainingPaise / 100).toFixed(2)} (the amount not yet refunded).`,
      });
    }

    // ── 5. Claim the refund lock ─────────────────────────────────────────────
    // Two concurrent requests (double-click, two admins) must not both reach
    // the gateway. The claim also re-checks paid status and the refunded total
    // we validated against, so a refund that landed in between is caught.
    const lockTime = new Date();
    const locked = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: "paid",
        refundedAmountPaise:
          alreadyRefundedPaise === 0
            ? { $in: [0, null] }
            : alreadyRefundedPaise,
        $or: [
          { refundLockedAt: null },
          {
            refundLockedAt: {
              $lt: new Date(lockTime.getTime() - REFUND_LOCK_TTL_MS),
            },
          },
        ],
      },
      { $set: { refundLockedAt: lockTime } },
    );
    if (!locked) {
      return res.status(409).json({
        success: false,
        message:
          "A refund for this order is already in progress or the order changed. Refresh and try again.",
      });
    }
    lockedOrderId = order._id;

    // ── 6. Call the gateway ──────────────────────────────────────────────────
    const gateway = isRazorpay ? "razorpay" : "phonepe";
    let gatewayRefundId;
    let refundState;
    let gatewayAmount;

    if (isRazorpay) {
      const razorpaySDK = require("./razorpaySDK");
      logger.info("[initiateRefund] Delegating refund to Razorpay SDK", {
        orderId,
        amountToRefund,
      });
      try {
        const result = await razorpaySDK.initiateRefund(
          order.orderId,
          amountToRefund,
          reason,
        );
        gatewayRefundId = result.refundId;
        refundState = result.state;
        gatewayAmount = result.amount;
      } catch (gwErr) {
        await releaseRefundLock(order._id);
        lockedOrderId = null;
        void logError(gwErr, {
          source: "payment/phonepeSDK.initiateRefund",
          req,
          statusCode: 502,
          metadata: { gateway, stage: "refund_gateway_call", orderId },
        });
        return res.status(502).json({
          success: false,
          message:
            gwErr.response?.data?.error?.description ||
            gwErr.message ||
            "Refund initiation failed via Razorpay",
        });
      }
    } else {
      const refundId = randomUUID(); // merchantRefundId for PhonePe
      const request = RefundRequest.builder()
        .amount(amountToRefund)
        .merchantRefundId(refundId)
        // Always the merchant order id — the request may have used the Mongo _id.
        .originalMerchantOrderId(order.orderId)
        .build();

      logger.info("📤 [initiateRefund] Sending refund request to PhonePe SDK", {
        orderId,
        merchantRefundId: refundId,
        amountToRefundPaise: amountToRefund,
        originalMerchantOrderId: order.orderId,
      });

      let response;
      try {
        response = await client.refund(request);
      } catch (sdkErr) {
        await releaseRefundLock(order._id);
        lockedOrderId = null;
        if (sdkErr instanceof PhonePeException) {
          void logError(sdkErr, {
            source: "payment/phonepeSDK.initiateRefund",
            req,
            statusCode: sdkErr.httpStatusCode || 502,
            metadata: {
              gateway,
              stage: "refund_sdk_call",
              orderId,
              refundId,
              amountToRefund,
              code: sdkErr.code,
              data: sdkErr.data,
            },
          });
          return res.status(502).json({
            success: false,
            message: sdkErr.message || "Refund initiation failed via PhonePe",
            code: sdkErr.code,
          });
        }
        throw sdkErr;
      }

      gatewayRefundId = refundId;
      refundState = response.state ?? "PENDING";
      gatewayAmount = response.amount;
    }

    // The gateway accepted the request. From here on, keep the lock if
    // something fails (it expires after REFUND_LOCK_TTL_MS) rather than
    // releasing it and inviting a second refund for money already on its way.
    lockedOrderId = null;

    logger.info("✅ [initiateRefund] Gateway refund response received", {
      orderId,
      gateway,
      refundId: gatewayRefundId,
      state: refundState,
      amount: gatewayAmount,
    });

    // A refund the gateway rejected outright never moves money: record the
    // attempt and leave the order paid.
    if (refundState === "FAILED") {
      await Order.updateOne(
        { _id: order._id },
        {
          $set: { refundLockedAt: null },
          $push: {
            refundAttempts: {
              merchantRefundId: gatewayRefundId,
              state: "FAILED",
              amountPaise: amountToRefund,
              initiatedAt: lockTime,
              resolvedAt: new Date(),
            },
          },
        },
      );
      return res.status(502).json({
        success: false,
        message: "The payment gateway rejected the refund. No money was refunded.",
      });
    }

    // ── 7. Persist refund state to DB ────────────────────────────────────────
    // A partial refund keeps the order paid and open. Only the refund that
    // brings the running total to the full amount marks the order refunded and
    // cancels it (restoring stock).
    const refundedTotalPaise = alreadyRefundedPaise + amountToRefund;
    const isFullRefund = refundedTotalPaise >= orderAmountPaise;
    const shouldCancel =
      isFullRefund &&
      order.orderStatus !== "cancelled" &&
      order.orderStatus !== "returned";

    const updateQuery = {
      $set: {
        refundStatus: refundState, // gateway's returned state
        refundId: gatewayRefundId, // latest refund — used to poll status via getRefundStatus
        refundedAt: new Date(),
        refundReason: reason || null,
        refundAmountPaise: amountToRefund,
        refundedAmountPaise: refundedTotalPaise,
        refundLockedAt: null,
        ...(isFullRefund ? { paymentStatus: "refunded" } : {}),
        ...(shouldCancel ? { orderStatus: "cancelled" } : {}),
      },
      $push: {
        // Always record the attempt for retry tracking
        refundAttempts: {
          merchantRefundId: gatewayRefundId,
          state: refundState,
          amountPaise: amountToRefund,
          initiatedAt: lockTime,
        },
      },
    };

    if (shouldCancel) {
      updateQuery.$push.statusHistory = {
        status: "cancelled",
        timestamp: new Date(),
        note: reason
          ? `Order cancelled automatically due to refund: ${reason}`
          : "Order cancelled automatically due to refund initiation",
      };
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id },
      updateQuery,
      { new: true },
    );

    if (!updatedOrder) {
      logger.error(
        "❌ [initiateRefund] DB update returned null — order may have been deleted",
        { orderId, refundId: gatewayRefundId },
      );
    } else {
      logger.info("💾 [initiateRefund] Order DB updated after refund", {
        orderId,
        paymentStatus: updatedOrder.paymentStatus,
        refundStatus: updatedOrder.refundStatus,
        refundId: updatedOrder.refundId,
        refundAmountPaise: updatedOrder.refundAmountPaise,
        refundedAmountPaise: updatedOrder.refundedAmountPaise,
        orderStatus: updatedOrder.orderStatus,
      });
      invalidateOrderReportCaches(`${gateway} refund initiated`);

      // Restore stock if the order was just cancelled
      if (shouldCancel) {
        try {
          await restoreOrderStock(updatedOrder);
          logger.info(
            "📦 [initiateRefund] Stock restored successfully for cancelled order",
            { orderId },
          );
        } catch (stockErr) {
          logger.error(
            "❌ [initiateRefund] Failed to restore stock after cancellation",
            {
              orderId,
              message: stockErr.message,
            },
          );
        }
      }

      // ── Send refund confirmation email to customer (fire-and-forget) ─────────
      emailService
        .sendRefundInitiatedEmail(null, updatedOrder, amountToRefund)
        .catch((emailErr) =>
          logger.error(
            "❌ [initiateRefund] Failed to send refund email:",
            emailErr.message,
          ),
        );
    } // end else (updatedOrder)

    return res.status(200).json({
      success: true,
      message: isFullRefund
        ? "Refund initiated successfully"
        : "Partial refund initiated successfully",
      refund: {
        refundId: gatewayRefundId,
        state: refundState,
        amount: gatewayAmount,
        merchantRefundId: gatewayRefundId,
        orderId,
        isFullRefund,
        refundedAmountPaise: refundedTotalPaise,
        remainingPaise: orderAmountPaise - refundedTotalPaise,
      },
    });
  } catch (err) {
    if (lockedOrderId) await releaseRefundLock(lockedOrderId);
    void logError(err, {
      source: "payment/phonepeSDK.initiateRefund",
      req,
      statusCode: err.statusCode || 500,
      metadata: {
        gateway: "phonepe",
        stage: "refund_handler_crash",
        orderId,
      },
    });
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Record a terminal gateway state (COMPLETED / FAILED) for one refund attempt.
 * Applied at most once per attempt: the match requires the attempt to be
 * unresolved, so repeated status polls are no-ops. A FAILED refund never moved
 * money, so its amount comes back off the refunded total and the order is
 * reopened (paid) for another refund.
 */
const applyTerminalRefundState = async (refundId, state) => {
  const order = await Order.findOne({
    "refundAttempts.merchantRefundId": refundId,
  });
  if (!order) return;

  const attempt = order.refundAttempts.find(
    (a) => a.merchantRefundId === refundId,
  );
  const $set = {
    "refundAttempts.$.state": state,
    "refundAttempts.$.resolvedAt": new Date(),
  };
  // Order-level refundStatus tracks the latest refund only.
  if (order.refundId === refundId) $set.refundStatus = state;
  if (state === "COMPLETED") $set.refundedAt = new Date();
  if (state === "FAILED") {
    $set.paymentStatus = "paid";
    $set.refundedAmountPaise = Math.max(
      0,
      (Number(order.refundedAmountPaise) || 0) - (attempt?.amountPaise || 0),
    );
    logger.warn(
      `⚠️ [getRefundStatus] Refund FAILED for orderId=${order.orderId}. Resetting paymentStatus to 'paid' for retry.`,
      { refundId },
    );
  }

  const result = await Order.updateOne(
    {
      _id: order._id,
      refundAttempts: {
        $elemMatch: { merchantRefundId: refundId, resolvedAt: null },
      },
    },
    { $set },
  );

  if (result.modifiedCount > 0) {
    logger.info(`💾 [getRefundStatus] DB updated with terminal refund state`, {
      orderId: order.orderId,
      refundId,
      state,
    });
    invalidateOrderReportCaches(`refund resolved (${state})`);
  }
};

/**
 * Check the status of a previously initiated refund.
 * @param {object} req - Express request: params.refundId = merchantRefundId
 * @param {object} res - Express response
 */
const getRefundStatus = async (req, res) => {
  const { refundId } = req.params;

  logger.info("📤 [getRefundStatus] Status check request received", {
    refundId,
    timestamp: new Date().toISOString(),
  });

  try {
    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!refundId) {
      logger.warn("⚠️ [getRefundStatus] Missing refundId in request params");
      return res
        .status(400)
        .json({ success: false, message: "refundId is required" });
    }

    // ── 1.5. Razorpay delegation check ───────────────────────────────────────
    // Look up by attempt, not just the latest refundId, so status checks for
    // an earlier partial refund still resolve.
    const order = await Order.findOne({
      "refundAttempts.merchantRefundId": refundId,
    });
    if (order && order.paymentMethod === "RAZORPAY") {
      const razorpaySDK = require("./razorpaySDK");
      logger.info("[getRefundStatus] Delegating status check to Razorpay SDK", { refundId });
      const razorpayRefundResult = await razorpaySDK.getRefundStatus(refundId);

      const state = razorpayRefundResult.state;
      if (state === "COMPLETED" || state === "FAILED") {
        await applyTerminalRefundState(refundId, state);
      } else {
        await Order.updateOne({ refundId }, { $set: { refundStatus: state } });
      }

      return res.status(200).json({
        success: true,
        refundStatus: {
          merchantId: razorpayRefundResult.merchantId,
          merchantRefundId: razorpayRefundResult.merchantRefundId,
          state: razorpayRefundResult.state,
          amount: razorpayRefundResult.amount,
          paymentDetails: [],
        },
      });
    }

    // ── 2. Call PhonePe SDK ──────────────────────────────────────────────────
    let response;
    try {
      response = await client.getRefundStatus(refundId);
    } catch (sdkErr) {
      if (sdkErr instanceof PhonePeException) {
        void logError(sdkErr, {
          source: "payment/phonepeSDK.getRefundStatus",
          req,
          statusCode: sdkErr.httpStatusCode || 502,
          metadata: {
            gateway: "phonepe",
            stage: "refund_status_sdk_call",
            refundId,
            code: sdkErr.code,
            data: sdkErr.data,
          },
        });
        return res.status(502).json({
          success: false,
          message: sdkErr.message || "Failed to fetch refund status",
          code: sdkErr.code,
        });
      }
      throw sdkErr;
    }

    logger.info("✅ [getRefundStatus] PhonePe SDK response received", {
      refundId,
      merchantRefundId: response.merchantRefundId,
      state: response.state,
      amount: response.amount,
      paymentDetailsCount: response.paymentDetails?.length ?? 0,
    });

    // ── 3. Sync DB on every poll ─────────────────────────────────────────────
    // Docs: keep polling until COMPLETED or FAILED; sync DB with the latest state
    const state = response.state;

    if (state === "COMPLETED" || state === "FAILED") {
      await applyTerminalRefundState(refundId, state);
    } else {
      // Non-terminal: just update the refundStatus field so the dashboard can show PENDING/CONFIRMED
      await Order.updateOne({ refundId }, { $set: { refundStatus: state } });
      logger.info(`🔄 [getRefundStatus] Refund still in progress`, {
        refundId,
        state,
      });
    }

    return res.status(200).json({
      success: true,
      refundStatus: {
        merchantId: response.merchantId,
        merchantRefundId: response.merchantRefundId,
        state: response.state,
        amount: response.amount,
        paymentDetails: response.paymentDetails ?? [],
      },
    });
  } catch (err) {
    void logError(err, {
      source: "payment/phonepeSDK.getRefundStatus",
      req,
      statusCode: err.statusCode || 500,
      metadata: {
        gateway: "phonepe",
        stage: "refund_status_handler_crash",
        refundId,
      },
    });
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

module.exports = {
  initiatePayment,
  checkOrderStatus,
  phonepeWebhook,
  manualCheckPaymentStatus,
  initiateRefund,
  getRefundStatus,
};
