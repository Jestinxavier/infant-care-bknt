const {
  StandardCheckoutClient,
  CreateSdkOrderRequest,
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

const initiatePayment = async ({ orderId, amount }) => {
  try {
    const order = await Order.findOne({ orderId }).lean();
    if (!order) throw new Error("INVALID_ORDER");

    const expectedAmount = order.totalAmount * 100;
    if (expectedAmount !== amount) throw new Error("AMOUNT_MISMATCH");

    const redirectToken = jwt.sign(
      { orderId, purpose: "PHONEPE_REDIRECT" },
      phonePeConfig.credentials.redirectSecret,
      { expiresIn: "1h" }
    );

    const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
      .merchantOrderId(orderId)
      .amount(amount)
      .redirectUrl(phonePeConfig.redirectUrl(redirectToken))
      .expireAfter(3600)
      .message("Complete payment")
      .build();

    const response = await client.pay(request);

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

const checkOrderStatus = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=invalid`
      );
    }

    const decoded = jwt.verify(token, phonePeConfig.credentials.redirectSecret);

    const order = await Order.findOne({ orderId: decoded.orderId }).lean();
    if (!order) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=invalid`
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/order-confirmation` +
        `?status=${order.paymentStatus}&orderId=${order.orderId}`
    );
  } catch {
    return res.redirect(
      `${process.env.FRONTEND_URL}/order-confirmation?status=expired`
    );
  }
};

const phonepeWebhook = async (req, res) => {
  try {
    const authorizationHeader = req.headers["authorization"];

    if (!authorizationHeader || !req.rawBody) {
      return res.status(400).send("INVALID CALLBACK");
    }

    /* ---------------------------------------------------- */
    /* 2. Validate callback authenticity (MANDATORY)        */
    const callbackResponse = client.validateCallback(
      phonePeConfig.credentials.username,
      phonePeConfig.credentials.password,
      authorizationHeader,
      req.rawBody
    );
    const { type, payload } = callbackResponse;
    const merchantOrderId =
      payload.merchantOrderId ?? payload.originalMerchantOrderId;

    if (!merchantOrderId) {
      return res.status(200).send("OK");
    }

    const order = await Order.findOne({ orderId: merchantOrderId });
    if (!order || order.paymentStatus === "paid") {
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

      console.log(`✅ PhonePe payment successful for order ${merchantOrderId}`, {
        transactionId,
        orderId: updatedOrder._id,
      });

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

          console.log(`❌ PhonePe webhook error handled for order ${merchantOrderId}`);
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
};
