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
const { logPhonePeError, logPhonePeInfo } = logger;
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
      const errorData = {
        code: err.code,
        httpStatusCode: err.httpStatusCode,
        message: err.message,
        data: err.data,
      };
      logPhonePeError("PhonePe SDK initiation failed", errorData);
      throw new Error("PHONEPE_INITIATION_FAILED");
    }
    logPhonePeError("Unexpected error during initiatePayment", { message: err.message, stack: err.stack });
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
        const errorData = {
          orderId,
          code: err.code,
          httpStatusCode: err.httpStatusCode,
          message: err.message,
          data: err.data,
        };
        logPhonePeError("PhonePe getOrderStatus failed", errorData);
        return res.redirect(
          `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${encodeURIComponent(orderId)}`,
        );
      }
      logPhonePeError("Unexpected error in checkOrderStatus", { orderId, error: err.message });
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
          emailService.sendOrderConfirmationEmail(updatedOrder).catch((err) =>
            logger.error("❌ Failed to send order confirmation email (redirect):", { message: err.message, stack: err.stack })
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
    logger.error("Error in checkOrderStatus:", error);
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
    logger.error("❌ Error in manualCheckPaymentStatus:", err);
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
      logger.error("❌ PhonePe webhook: Missing authorization or body");
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
        logger.error(
          "❌ PhonePe webhook: Invalid callback (validateCallback failed)",
          errorData,
        );
        logPhonePeError("Webhook validation failed", errorData);
        return res.status(400).send("INVALID CALLBACK");
      }
      wlog("VALIDATION_UNEXPECTED_ERROR", { message: err.message });
      logPhonePeError("Unexpected error in webhook validation", err);
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
      logger.warn("⚠️ PhonePe webhook: No merchantOrderId in payload");
      return res.status(200).send("OK");
    }

    const order = await Order.findOne({ orderId: merchantOrderId });
    if (!order) {
      wlog("ORDER_NOT_FOUND", { merchantOrderId });
      logger.warn(`⚠️ PhonePe webhook: Order not found: ${merchantOrderId}`);
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

      emailService.sendOrderConfirmationEmail(updatedOrder).catch((err) =>
        logger.error("❌ Failed to send order confirmation email (webhook):", { message: err.message, stack: err.stack })
      );
    } else if (
      type === "CHECKOUT_ORDER_FAILED" ||
      type === "checkout.order.failed"
    ) {
      wlog("PROCESSING_FAILED", { merchantOrderId });
      // Update Order
      await Order.updateOne(
        { orderId: merchantOrderId },
        { $set: { paymentStatus: "failed", orderStatus: "cancelled" } },
      );

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
      logger.info(`❌ PhonePe payment failed for order ${merchantOrderId}`, failLog);
      logPhonePeError(`Payment failed for order ${merchantOrderId}`, failLog);

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
    logger.error("PhonePe webhook error:", err.message, err.stack);
    logPhonePeError("Webhook processing crashed", { message: err.message, stack: err.stack, body: req.rawBody });
    try {
      const body = JSON.parse(req.rawBody);
      const merchantOrderId =
        body?.payload?.merchantOrderId ??
        body?.payload?.originalMerchantOrderId;
      if (merchantOrderId) {
        const failedOrder = await Order.findOne({ orderId: merchantOrderId });
        if (failedOrder) {
          // Update Order
          await Order.updateOne(
            { orderId: merchantOrderId },
            { $set: { paymentStatus: "failed", orderStatus: "cancelled" } },
          );

          // Update Payment record
          await Payment.findOneAndUpdate(
            { orderId: failedOrder._id },
            {
              $set: {
                status: "failed",
                phonepeResponse: body, // Store error response
              },
            },
          );

          await Cart.findOneAndUpdate(
            { orderId: failedOrder._id },
            {
              $set: { status: "active", completedAt: null },
              $unset: { orderId: "" },
            },
          );

          logger.info(
            `❌ PhonePe webhook error handled for order ${merchantOrderId}`,
          );
        }
      }
    } catch (parseErr) {
      logger.error("Failed to parse webhook body for cleanup:", parseErr);
    }

    return res.status(400).send("INVALID CALLBACK");
  }
};

/**
 * Initiate a refund for a paid PhonePe order.
 * @param {object} req - Express request: body = { orderId, refundAmount (in paise, optional) }
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

  try {
    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!orderId) {
      logger.warn("⚠️ [initiateRefund] Missing orderId in request body");
      return res
        .status(400)
        .json({ success: false, message: "orderId is required" });
    }

    // ── 2. Order lookup ──────────────────────────────────────────────────────
    const order = await Order.findOne({ orderId }).lean();
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
      phonepeTransactionId: order.phonepeTransactionId,
    });

    // ── 2.5. Razorpay delegation ─────────────────────────────────────────────
    if (order.paymentMethod === "RAZORPAY") {
      const razorpaySDK = require("./razorpaySDK");
      const orderAmountPaise = Math.round(order.totalAmount * 100);
      const amountToRefund = refundAmount
        ? Math.round(Number(refundAmount))
        : orderAmountPaise;

      logger.info("[initiateRefund] Delegating refund to Razorpay SDK", { orderId, amountToRefund });
      const razorpayRefundResult = await razorpaySDK.initiateRefund(orderId, amountToRefund, reason);

      let newOrderStatus = order.orderStatus;
      let pushToHistory = null;
      let stockShouldBeRestored = false;

      if (order.orderStatus !== "cancelled" && order.orderStatus !== "returned") {
        newOrderStatus = "cancelled";
        stockShouldBeRestored = true;
        pushToHistory = {
          status: "cancelled",
          timestamp: new Date(),
          note: reason
            ? `Order cancelled automatically due to refund: ${reason}`
            : "Order cancelled automatically due to refund initiation",
        };
      }

      const updateQuery = {
        $set: {
          paymentStatus: "refunded",
          refundStatus: razorpayRefundResult.state,
          refundId: razorpayRefundResult.refundId,
          refundedAt: new Date(),
          refundReason: reason || null,
          refundAmountPaise: amountToRefund,
          orderStatus: newOrderStatus,
        },
        $push: {
          refundAttempts: {
            merchantRefundId: razorpayRefundResult.refundId,
            state: razorpayRefundResult.state,
            amountPaise: amountToRefund,
            initiatedAt: new Date(),
          },
        },
      };

      if (pushToHistory) {
        updateQuery.$push.statusHistory = pushToHistory;
      }

      const updatedOrder = await Order.findOneAndUpdate(
        { orderId },
        updateQuery,
        { new: true }
      );

      if (updatedOrder && stockShouldBeRestored) {
        try {
          await restoreOrderStock(updatedOrder);
          logger.info("[initiateRefund] Razorpay refund: Stock restored successfully", { orderId });
        } catch (stockErr) {
          logger.error("❌ Failed to restore stock after Razorpay cancellation:", stockErr);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Refund initiated successfully",
        refund: {
          refundId: razorpayRefundResult.refundId,
          state: razorpayRefundResult.state,
          amount: razorpayRefundResult.amount,
          merchantRefundId: razorpayRefundResult.refundId,
          orderId,
        },
      });
    }

    // ── 3. Eligibility checks ────────────────────────────────────────────────
    if (order.paymentMethod !== "PHONEPE") {
      logger.warn(
        `⚠️ [initiateRefund] Refund rejected – unsupported payment method: ${order.paymentMethod}`,
        { orderId },
      );
      return res.status(400).json({
        success: false,
        message: "Refund is only supported for PhonePe payments",
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

    // Use incoming paise directly; if not provided, default to full order amount
    const amountToRefund = refundAmount
      ? Math.round(Number(refundAmount)) // already in paise from dashboard
      : orderAmountPaise;

    logger.info("📋 [initiateRefund] Refund amount resolved", {
      orderId,
      orderTotalRupees: order.totalAmount,
      orderAmountPaise,
      requestedRefundAmountPaise:
        refundAmount ?? "(not provided — full refund)",
      amountToRefundPaise: amountToRefund,
      amountToRefundRupees: (amountToRefund / 100).toFixed(2),
    });

    if (amountToRefund < 1 || amountToRefund > orderAmountPaise) {
      logger.warn(
        `⚠️ [initiateRefund] Refund rejected – amount out of range: ${amountToRefund} paise (max: ${orderAmountPaise} paise)`,
        { orderId, orderAmountPaise },
      );
      return res.status(400).json({
        success: false,
        message: `Invalid refund amount ₹${(amountToRefund / 100).toFixed(2)}. Must be between ₹0.01 and ₹${order.totalAmount}`,
      });
    }

    // ── 5. Build SDK request ─────────────────────────────────────────────────
    const refundId = randomUUID(); // merchantRefundId for PhonePe

    const request = RefundRequest.builder()
      .amount(amountToRefund)
      .merchantRefundId(refundId)
      .originalMerchantOrderId(orderId)
      .build();

    logger.info("📤 [initiateRefund] Sending refund request to PhonePe SDK", {
      orderId,
      merchantRefundId: refundId,
      amountToRefundPaise: amountToRefund,
      amountToRefundRupees: (amountToRefund / 100).toFixed(2),
      originalMerchantOrderId: orderId,
    });

    logger.info("------request", request);

    // ── 6. Call PhonePe SDK ──────────────────────────────────────────────────
    let response;
    try {
      response = await client.refund(request);
    } catch (sdkErr) {
      if (sdkErr instanceof PhonePeException) {
        const errorData = {
          orderId,
          refundId,
          amountToRefund,
          code: sdkErr.code,
          httpStatusCode: sdkErr.httpStatusCode,
          message: sdkErr.message,
          data: sdkErr.data,
        };
        logger.error("❌ [initiateRefund] PhonePe SDK refund call failed", errorData);
        logPhonePeError("PhonePe SDK refund call failed", errorData);
        return res.status(502).json({
          success: false,
          message: sdkErr.message || "Refund initiation failed via PhonePe",
          code: sdkErr.code,
        });
      }
      throw sdkErr;
    }

    logger.info("✅ [initiateRefund] PhonePe SDK refund response received", {
      orderId,
      merchantRefundId: refundId,
      state: response.state,
      amount: response.amount,
    });

    // ── 7. Persist refund state to DB ────────────────────────────────────────
    let newOrderStatus = order.orderStatus;
    let pushToHistory = null;
    let stockShouldBeRestored = false;

    // If order is not already cancelled or returned, cancel it automatically
    if (order.orderStatus !== "cancelled" && order.orderStatus !== "returned") {
      newOrderStatus = "cancelled";
      stockShouldBeRestored = true;
      pushToHistory = {
        status: "cancelled",
        timestamp: new Date(),
        note: reason
          ? `Order cancelled automatically due to refund: ${reason}`
          : "Order cancelled automatically due to refund initiation",
      };
    }

    const updateQuery = {
      $set: {
        paymentStatus: "refunded",
        refundStatus: response.state ?? "PENDING", // Use PhonePe's returned state
        refundId: refundId, // merchantRefundId — used to poll status via getRefundStatus
        refundedAt: new Date(),
        refundReason: reason || null,
        refundAmountPaise: amountToRefund,
        orderStatus: newOrderStatus,
      },
      $push: {
        // Always record the attempt for retry tracking
        refundAttempts: {
          merchantRefundId: refundId,
          state: response.state ?? "PENDING",
          amountPaise: amountToRefund,
          initiatedAt: new Date(),
        },
      },
    };

    if (pushToHistory) {
      updateQuery.$push.statusHistory = pushToHistory;
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      updateQuery,
      { new: true },
    );

    if (!updatedOrder) {
      logger.error(
        "❌ [initiateRefund] DB update returned null — order may have been deleted",
        { orderId, refundId },
      );
    } else {
      logger.info("💾 [initiateRefund] Order DB updated after refund", {
        orderId,
        paymentStatus: updatedOrder.paymentStatus,
        refundStatus: updatedOrder.refundStatus,
        refundId: updatedOrder.refundId,
        refundAmountPaise: updatedOrder.refundAmountPaise,
        orderStatus: updatedOrder.orderStatus,
      });

      // Restore stock if the order was just cancelled
      if (stockShouldBeRestored) {
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
      try {
        const User = require("../../models/user");
        const user = await User.findById(updatedOrder.userId).select(
          "username email",
        );
        if (user?.email) {
          emailService
            .sendRefundInitiatedEmail(user, updatedOrder, amountToRefund)
            .catch((emailErr) =>
              logger.error(
                "❌ [initiateRefund] Failed to send refund email:",
                emailErr.message,
              ),
            );
          logger.info(
            `📧 [initiateRefund] Refund email dispatched to ${user.email}`,
          );
        }
      } catch (emailLookupErr) {
        logger.error(
          "❌ [initiateRefund] Failed to look up user for refund email:",
          emailLookupErr.message,
        );
      }
    } // end else (updatedOrder)

    return res.status(200).json({
      success: true,
      message: "Refund initiated successfully",
      refund: {
        refundId: refundId,
        state: response.state,
        amount: response.amount,
        merchantRefundId: refundId,
        orderId,
      },
    });
  } catch (err) {
    const errorData = {
      orderId,
      message: err.message,
      stack: err.stack,
    };
    logger.error("❌ [initiateRefund] Unexpected error", errorData);
    logPhonePeError("Unexpected error in initiateRefund", errorData);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
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
    const order = await Order.findOne({ refundId });
    if (order && order.paymentMethod === "RAZORPAY") {
      const razorpaySDK = require("./razorpaySDK");
      logger.info("[getRefundStatus] Delegating status check to Razorpay SDK", { refundId });
      const razorpayRefundResult = await razorpaySDK.getRefundStatus(refundId);

      const state = razorpayRefundResult.state;
      if (state === "COMPLETED" || state === "FAILED") {
        const dbUpdate = {
          $set: { refundStatus: state },
        };

        if (state === "FAILED") {
          dbUpdate.$set.paymentStatus = "paid";
        }

        if (state === "COMPLETED") {
          dbUpdate.$set.refundedAt = new Date();
        }

        await Order.updateOne(
          { refundId, "refundAttempts.merchantRefundId": refundId },
          {
            ...dbUpdate,
            $set: {
              ...dbUpdate.$set,
              "refundAttempts.$.state": state,
              "refundAttempts.$.resolvedAt": new Date(),
            },
          }
        );
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
        logger.error(
          "❌ [getRefundStatus] PhonePe SDK getRefundStatus call failed",
          {
            refundId,
            code: sdkErr.code,
            httpStatusCode: sdkErr.httpStatusCode,
            message: sdkErr.message,
            data: sdkErr.data,
          },
        );
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
      const order = await Order.findOne({ refundId });
      if (order) {
        const dbUpdate = {
          $set: { refundStatus: state },
        };

        if (state === "FAILED") {
          // Allow re-initiation: reset paymentStatus back to paid so a fresh refund can be triggered
          dbUpdate.$set.paymentStatus = "paid";
          logger.warn(
            `⚠️ [getRefundStatus] Refund FAILED for orderId=${order.orderId}. Resetting paymentStatus to 'paid' for retry.`,
            { refundId },
          );
        }

        if (state === "COMPLETED") {
          dbUpdate.$set.refundedAt = new Date();
        }

        // Update the resolvedAt on the matching refundAttempts entry
        await Order.updateOne(
          { refundId, "refundAttempts.merchantRefundId": refundId },
          {
            ...dbUpdate,
            $set: {
              ...dbUpdate.$set,
              "refundAttempts.$.state": state,
              "refundAttempts.$.resolvedAt": new Date(),
            },
          },
        );

        logger.info(
          `💾 [getRefundStatus] DB updated with terminal refund state`,
          {
            orderId: order.orderId,
            refundId,
            state,
          },
        );
      }
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
    logger.error("❌ [getRefundStatus] Unexpected error", {
      refundId,
      message: err.message,
      stack: err.stack,
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
