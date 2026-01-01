const {
  StandardCheckoutClient,
  CreateSdkOrderRequest,
  PhonePeException,
} = require("pg-sdk-node");

const { phonePeConfig } = require("../../config/phonepeConfig");
const Order = require("../../models/Order");
const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const jwt = require("jsonwebtoken");

/* ------------------------------------------------------------------ */
/* Client initialization                                              */
/* ------------------------------------------------------------------ */

const client = StandardCheckoutClient.getInstance(
  phonePeConfig.credentials.clientId,
  phonePeConfig.credentials.clientSecret,
  phonePeConfig.credentials.clientVersion,
  phonePeConfig.env
);

/* ------------------------------------------------------------------ */
/* PAYMENT INITIATION (SDK ONLY – NO STATE MUTATION)                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* REDIRECT HANDLER (READ-ONLY – UI ONLY)                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* PHONEPE WEBHOOK (SINGLE SOURCE OF TRUTH)                            */
/* ------------------------------------------------------------------ */

const phonepeWebhook = async (req, res) => {
  try {
    const authorizationHeader = req.headers["authorization"];
    if (!authorizationHeader) {
      return res.status(400).send("MISSING AUTH HEADER");
    }

    const bodyString = req.rawBody;

    const callbackResponse = client.validateCallback(
      phonePeConfig.credentials.username,
      phonePeConfig.credentials.password,
      authorizationHeader,
      bodyString
    );

    const { orderId, state, transactionId } = callbackResponse.payload;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(200).send("OK");

    /* Idempotency guard */
    if (order.paymentStatus === "paid") {
      return res.status(200).send("OK");
    }

    if (state === "COMPLETED") {
      await Order.updateOne(
        { orderId, paymentStatus: { $ne: "paid" } },
        {
          $set: {
            paymentStatus: "paid",
            paymentMethod: PAYMENT_METHODS.PHONEPE,
            phonepeTransactionId: transactionId,
          },
        }
      );

      await Cart.findOneAndUpdate(
        { orderId: order._id },
        { status: "ordered", completedAt: new Date() }
      );

      console.log(`✅ Payment completed for order ${orderId}`);
    }

    if (state === "FAILED") {
      await Order.updateOne(
        { orderId, paymentStatus: { $ne: "paid" } },
        { $set: { paymentStatus: "failed", status: "cancelled" } }
      );

      await Cart.findOneAndUpdate(
        { orderId: order._id },
        { status: "active", orderId: null, completedAt: null }
      );

      for (const item of order.items) {
        if (item.variantId) {
          await Product.updateOne(
            { _id: item.productId, "variants.id": item.variantId },
            {
              $inc: {
                "variants.$.stockObj.available": item.quantity,
                "variants.$.stock": item.quantity,
              },
            }
          );
        } else {
          await Product.updateOne(
            { _id: item.productId },
            {
              $inc: {
                "stockObj.available": item.quantity,
                stock: item.quantity,
              },
            }
          );
        }
      }

      console.log(`⚠️ Payment failed for order ${orderId}`);
    }

    if (state === "PENDING") {
      await Order.updateOne(
        { orderId, paymentStatus: { $ne: "paid" } },
        { $set: { paymentStatus: "pending" } }
      );
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error", err);
    return res.status(400).send("INVALID CALLBACK");
  }
};

/* ------------------------------------------------------------------ */

module.exports = {
  initiatePayment,
  checkOrderStatus,
  phonepeWebhook,
};
