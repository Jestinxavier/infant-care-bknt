const {
  StandardCheckoutClient,
  CreateSdkOrderRequest,
} = require("pg-sdk-node");
const { phonePeConfig } = require("../../config/phonepeConfig");
const Order = require("../../models/Order");
const { PAYMENT_METHODS } = require("../../../resources/constants");
const jwt = require("jsonwebtoken");

const client = StandardCheckoutClient.getInstance(
  phonePeConfig.credentials.clientId,
  phonePeConfig.credentials.clientSecret,
  phonePeConfig.credentials.clientVersion,
  phonePeConfig.env
);

const initiatePayment = async (data) => {
  try {
    const { orderId, amount } = data;

    const order = await Order.findOne({ orderId }).lean();
    const orderTotal = order.totalAmount * 100;
    if (!order) {
      throw new Error("Invalid order");
    }

    if (orderTotal !== amount) {
      throw new Error("Amount mismatch");
    }

    // 2. Create redirect token (short-lived)
    const redirectToken = jwt.sign(
      {
        orderId,
        purpose: "PHONEPE_REDIRECT",
      },
      phonePeConfig.credentials.redirectSecret || process.env.JWT_SECRET,
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
    return {
      redirectUrl: response.redirectUrl,
    };
  } catch (error) {
    throw error;
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

    // 1. Verify redirect token
    const decoded = jwt.verify(
      token,
      phonePeConfig.credentials.redirectSecret || process.env.JWT_SECRET
    );
    const { orderId } = decoded;

    // 2. Read-only DB fetch
    const order = await Order.findOne({ orderId }).lean();

    if (!order) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=invalid`
      );
    }

    // 3. Fetch order status from PhonePe
    const response = await client.getOrderStatus(orderId);
    if (response.state === "COMPLETED") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "paid", paymentMethod: PAYMENT_METHODS.PHONEPE }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=success&orderId=${orderId}`
      );
    } else if (response.state === "FAILED") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "failed", paymentMethod: PAYMENT_METHODS.PHONEPE }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
      );
    } else if (response.state === "PENDING") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "pending", paymentMethod: PAYMENT_METHODS.PHONEPE }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=pending&orderId=${orderId}`
      );
    }
    return res.json({
      success: false,
      message: "Payment Failed",
      data: response,
    });
  } catch (error) {
    console.log("Error checking order status:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/order-confirmation?status=failed`
    );
  }
};

const phonepeWebhook = async (req, res) => {
  try {
    // 1. Extract authorization header
    const authorizationHeader = req.headers["authorization"];
    if (!authorizationHeader) {
      return res.status(400).send("Missing authorization header");
    }

    // 2. Convert body to raw string (DO NOT MODIFY)
    const bodyString = JSON.stringify(req.body);

    // 3. Validate PhonePe signature
    const callbackResponse = client.validateCallback(
      phonePeConfig.credentials.username,
      phonePeConfig.credentials.password,
      authorizationHeader,
      bodyString
    );

    const { orderId, state, transactionId } = callbackResponse.payload;

    // 4. Idempotency check
    const order = await Order.findOne({ orderId });
    if (!order || order.paymentStatus === "paid") {
      return res.status(200).send("OK");
    }

    // 5. Update order state
    if (state === "COMPLETED") {
      order.paymentStatus = "paid";
      order.paymentMethod = PAYMENT_METHODS.PHONEPE;
      order.phonepeTransactionId = transactionId;
    } else if (state === "FAILED") {
      order.paymentStatus = "failed";
    } else if (state === "PENDING") {
      order.paymentStatus = "pending";
    }

    await order.save();

    // 6. Acknowledge PhonePe
    return res.status(200).send("OK");
  } catch (err) {
    console.error("PhonePe webhook validation failed", err);
    return res.status(400).send("INVALID CALLBACK");
  }
};

module.exports = {
  initiatePayment,
  checkOrderStatus,
  phonepeWebhook,
};
