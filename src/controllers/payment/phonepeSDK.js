const {
  StandardCheckoutClient,
  CreateSdkOrderRequest,
} = require("pg-sdk-node");
const { phonePeConfig } = require("../../config/phonepeConfig");
const Order = require("../../models/Order");

const client = StandardCheckoutClient.getInstance(
  phonePeConfig.credentials.clientId,
  phonePeConfig.credentials.clientSecret,
  phonePeConfig.credentials.clientVersion,
  phonePeConfig.env
);

const initiatePayment = async (data) => {
  try {
    const { orderId, amount } = data;

    const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
      .merchantOrderId(orderId)
      .amount(amount)
      .redirectUrl(phonePeConfig.redirectUrl(orderId))
      .expireAfter(3600)
      .message("Message that will be shown for UPI collect transaction")
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
    const { orderId } = req.query;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Missing order ID",
      });
    }

    const response = await client.getOrderStatus(orderId);
    if (response.state === "COMPLETED") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "paid", paymentMethod: "phonepe" }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=success&orderId=${orderId}`
      );
    } else if (response.state === "FAILED") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "failed", paymentMethod: "phonepe" }
      );
      return res.redirect(
        `${process.env.FRONTEND_URL}/order-confirmation?status=failed&orderId=${orderId}`
      );
    } else if (response.state === "PENDING") {
      await Order.findOneAndUpdate(
        { orderId },
        { paymentStatus: "pending", paymentMethod: "phonepe" }
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

module.exports = {
  initiatePayment,
  checkOrderStatus,
};
