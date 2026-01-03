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
    /* ---------------------------------------------------- */
    /* 1. Basic safety checks                               */
    /* ---------------------------------------------------- */
    const authorizationHeader = req.headers["authorization"];
    if (!authorizationHeader || !req.rawBody) {
      return res.status(400).send("INVALID CALLBACK");
    }

    /* ---------------------------------------------------- */
    /* 2. Validate callback authenticity (MANDATORY)        */
    /* ---------------------------------------------------- */
    const callbackResponse = client.validateCallback(
      phonePeConfig.credentials.username,
      phonePeConfig.credentials.password,
      authorizationHeader,
      req.rawBody
    );

    const { type, payload } = callbackResponse;

    console.log("---------callbackResponse--------", callbackResponse, req);

    /* ---------------------------------------------------- */
    /* 3. Extract YOUR order id (not PhonePe orderId)        */
    /* ---------------------------------------------------- */
    const merchantOrderId = payload.originalMerchantOrderId;
    if (!merchantOrderId) {
      return res.status(200).send("OK");
    }

    const order = await Order.findOne({ orderId: merchantOrderId });
    if (!order) {
      return res.status(200).send("OK");
    }

    /* ---------------------------------------------------- */
    /* 4. Idempotency guard                                  */
    /* ---------------------------------------------------- */
    if (order.paymentStatus === "paid") {
      return res.status(200).send("OK");
    }

    /* ---------------------------------------------------- */
    /* 5. Handle events based on CALLBACK TYPE               */
    /* ---------------------------------------------------- */
    switch (type) {
      case "CHECKOUT_ORDER_COMPLETED": {
        const paymentAttempt = payload.paymentDetails?.[0];

        await Order.updateOne(
          { orderId: merchantOrderId },
          {
            $set: {
              paymentStatus: "paid",
              paymentMethod: PAYMENT_METHODS.PHONEPE,
              phonepeTransactionId: paymentAttempt?.transactionId || null,
            },
          }
        );

        await Cart.findOneAndUpdate(
          { orderId: merchantOrderId },
          {
            status: "ordered",
            completedAt: new Date(),
          }
        );

        console.log(`✅ PhonePe payment completed: ${merchantOrderId}`);
        break;
      }

      case "CHECKOUT_ORDER_FAILED": {
        await Order.updateOne(
          { orderId: merchantOrderId },
          {
            $set: {
              paymentStatus: "failed",
              status: "cancelled",
            },
          }
        );

        await Cart.findOneAndUpdate(
          { orderId: merchantOrderId },
          {
            status: "active",
            orderId: null,
            completedAt: null,
          }
        );

        /* Restore stock */
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

        console.log(`❌ PhonePe payment failed: ${merchantOrderId}`);
        break;
      }

      /* Ignore other events like refunds here */
      default:
        break;
    }

    /* ---------------------------------------------------- */
    return res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook error:", err);
    return res.status(400).send("INVALID CALLBACK");
  }
};

/* ------------------------------------------------------------------ */

module.exports = {
  initiatePayment,
  checkOrderStatus,
  phonepeWebhook,
};
