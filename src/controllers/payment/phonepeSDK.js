const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  PhonePeException,
} = require("pg-sdk-node");

const { phonePeConfig } = require("../../config/phonepeConfig");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const Cart = require("../../models/Cart");
const { restoreOrderStock } = require("../../utils/orderStockRestore");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const jwt = require("jsonwebtoken");

const client = StandardCheckoutClient.getInstance(
  phonePeConfig.credentials.clientId,
  phonePeConfig.credentials.clientSecret,
  phonePeConfig.credentials.clientVersion,
  phonePeConfig.env
);

/**
 * Initiate payment for website checkout (Standard Checkout).
 * Uses StandardCheckoutPayRequest per PhonePe docs; CreateSdkOrderRequest is for mobile SDK only.
 */
const initiatePayment = async ({ orderId, amount }) => {
  try {
    const order = await Order.findOne({ orderId }).lean();
    if (!order) throw new Error("INVALID_ORDER");
    console.log("📋 PhonePe order", order);

    const expectedAmount = order.totalAmount * 100;
    console.log("📋 PhonePe amount", amount);
    if (expectedAmount !== amount) throw new Error("AMOUNT_MISMATCH");
    console.log("📋 PhonePe expectedAmount", expectedAmount);

    const redirectToken = jwt.sign(
      { orderId, purpose: "PHONEPE_REDIRECT" },
      phonePeConfig.credentials.redirectSecret,
      { expiresIn: "1h" }
    );
    console.log("📋 PhonePe redirectToken", redirectToken);

    const redirectUrlWithOrderId = phonePeConfig.redirectUrl(
      orderId,
      redirectToken
    );

    console.log("📋 PhonePe redirectUrlWithOrderId", redirectUrlWithOrderId);
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(orderId)
      .amount(amount)
      .redirectUrl(phonePeConfig.redirectUrl(redirectToken, orderId))
      .expireAfter(3600)
      .message("Complete payment")
      .expireAfter(3600)
      .build();

    console.log("📋 PhonePe request", request);
    const response = await client.pay(request);
    console.log("📋 PhonePe response", response);
    return { redirectUrl: response.redirectUrl };
  } catch (err) {
    if (err instanceof PhonePeException) {
      const orderDoc = await Order.findOne({ orderId }).lean();
      if (orderDoc) {
        await Order.updateOne(
          { orderId },
          { $set: { paymentStatus: "failed", orderStatus: "cancelled" } }
        );
        await Cart.findOneAndUpdate(
          { orderId: orderDoc._id },
          {
            $set: { status: "active", completedAt: null },
            $unset: { orderId: "" },
          }
        );
      }
      console.error("PhonePe SDK error", {
        code: err.code,
        httpStatusCode: err.httpStatusCode,
        message: err.message,
        data: err.data,
      });
      throw new Error("PHONEPE_INITIATION_FAILED");
    }
    throw err;
  }
};

/**
 * Order confirmation / redirect handler.
 * PhonePe redirects here after payment with orderId (and optionally token) in query.
 * We call getOrderStatus, update DB, then redirect to frontend with status and orderId.
 */
const checkOrderStatus = async (req, res) => {
  console.log("📥 PhonePe order confirmation request received", req.query);
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
          }
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
          `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}&error=invalid_redirect`
        );
      }
    }

    let response;
    try {
      response = await client.getOrderStatus(orderId);
    } catch (err) {
      if (err instanceof PhonePeException) {
        console.error("PhonePe getOrderStatus error", {
          orderId,
          code: err.code,
          httpStatusCode: err.httpStatusCode,
          message: err.message,
          data: err.data,
        });
        return res.redirect(
          `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
        );
      }
      throw err;
    }

    console.log("📋 PhonePe order status response", response);

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
          }
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
            }
          );
          await Cart.findOneAndUpdate(
            { orderId: updatedOrder._id },
            { $set: { status: "ordered", completedAt: new Date() } }
          );
        }
      }
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=success&orderId=${orderId}`
      );
    }

    if (state === "FAILED") {
      await Order.findOneAndUpdate(
        { orderId },
        { $set: { paymentStatus: "failed", paymentMethod: "phonepe" } }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
      );
    }

    if (state === "PENDING") {
      await Order.findOneAndUpdate(
        { orderId },
        { $set: { paymentStatus: "pending", paymentMethod: "phonepe" } }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=pending&orderId=${orderId}`
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
    );
  } catch (error) {
    console.error("Error in checkOrderStatus:", error);
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
    console.error("❌ Error in manualCheckPaymentStatus:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

const phonepeWebhook = async (req, res) => {
  console.log("📥 PhonePe webhook received", {
    timestamp: new Date().toISOString(),
    hasAuth: !!req.headers["authorization"],
    hasBody: !!req.rawBody,
    bodyLength: req.rawBody?.length,
  });

  try {
    const authorizationHeader = req.headers["authorization"];

    if (!authorizationHeader || !req.rawBody) {
      console.error("❌ PhonePe webhook: Missing authorization or body");
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
        req.rawBody
      );
    } catch (err) {
      if (err instanceof PhonePeException) {
        console.error(
          "❌ PhonePe webhook: Invalid callback (validateCallback failed)",
          {
            code: err.code,
            httpStatusCode: err.httpStatusCode,
            message: err.message,
            data: err.data,
          }
        );
        return res.status(400).send("INVALID CALLBACK");
      }
      throw err;
    }

    const { type, payload } = callbackResponse;
    const merchantOrderId =
      payload.merchantOrderId ?? payload.originalMerchantOrderId;

    console.log("📋 PhonePe webhook payload", {
      type,
      merchantOrderId,
      hasPaymentDetails: !!payload.paymentDetails,
    });

    if (!merchantOrderId) {
      console.warn("⚠️ PhonePe webhook: No merchantOrderId in payload");
      return res.status(200).send("OK");
    }

    const order = await Order.findOne({ orderId: merchantOrderId });
    if (!order) {
      console.warn(`⚠️ PhonePe webhook: Order not found: ${merchantOrderId}`);
      return res.status(200).send("OK");
    }

    if (order.paymentStatus === "paid") {
      console.log(`ℹ️ PhonePe webhook: Order already paid: ${merchantOrderId}`);
      return res.status(200).send("OK");
    }

    const isOrderCompleted =
      type === "CHECKOUT_ORDER_COMPLETED" ||
      type === "checkout.order.completed";

    if (isOrderCompleted) {
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
        { new: true } // returns updated document ̰
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
        { new: true }
      );

      console.log(
        `✅ PhonePe payment successful for order ${merchantOrderId}`,
        {
          transactionId,
          orderId: updatedOrder._id,
          paymentStatus: updatedOrder.paymentStatus,
          orderStatus: updatedOrder.orderStatus,
          payload: JSON.stringify(payload).substring(0, 200), // Log first 200 chars
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
    } else if (
      type === "CHECKOUT_ORDER_FAILED" ||
      type === "checkout.order.failed"
    ) {
      // Update Order
      await Order.updateOne(
        { orderId: merchantOrderId },
        { $set: { paymentStatus: "failed", orderStatus: "cancelled" } }
      );

      // Update Payment record
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: {
            status: "failed",
            phonepeResponse: payload, // Store failure response for reference
          },
        }
      );

      console.log(`❌ PhonePe payment failed for order ${merchantOrderId}`, {
        orderId: order._id,
        payload: JSON.stringify(payload),
      });

      await Cart.findOneAndUpdate(
        { orderId: order._id },
        {
          $set: { status: "active", completedAt: null },
          $unset: { orderId: "" },
        }
      );

      await restoreOrderStock(order);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error:", err.message, err.stack);
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
            { $set: { paymentStatus: "failed", orderStatus: "cancelled" } }
          );

          // Update Payment record
          await Payment.findOneAndUpdate(
            { orderId: failedOrder._id },
            {
              $set: {
                status: "failed",
                phonepeResponse: body, // Store error response
              },
            }
          );

          await Cart.findOneAndUpdate(
            { orderId: failedOrder._id },
            {
              $set: { status: "active", completedAt: null },
              $unset: { orderId: "" },
            }
          );

          console.log(
            `❌ PhonePe webhook error handled for order ${merchantOrderId}`
          );
        }
      }
    } catch (parseErr) {
      console.error("Failed to parse webhook body for cleanup:", parseErr);
    }

    return res.status(400).send("INVALID CALLBACK");
  }
};

module.exports = {
  initiatePayment,
  checkOrderStatus,
  phonepeWebhook,
  manualCheckPaymentStatus,
};
