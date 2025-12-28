const axios = require("axios");
const {
  phonePeConfig,
  generateXVerify,
  verifyCallbackChecksum,
} = require("../../config/phonepe");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");

/**
 * Initialize PhonePe Payment (V1 Manual Flow)
 */
const initPhonePePayment = async (req, res) => {
  try {
    const { orderId, amount, userId } = req.body;

    if (!orderId || !amount || !userId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Order ID, amount, and user ID are required",
        });
    }

    const transactionId = `T${Date.now()}${orderId.toString().slice(-12)}`;

    // Payload for PhonePe V1 API
    const payload = {
      merchantId: phonePeConfig.merchantId,
      merchantTransactionId: transactionId,
      merchantUserId: userId,
      amount: Math.round(amount * 100), // paise
      redirectUrl: `${phonePeConfig.redirectUrl}?orderId=${orderId}`,
      redirectMode: "REDIRECT",
      callbackUrl: phonePeConfig.callbackUrl,
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      "base64"
    );
    const xVerify = generateXVerify(base64Payload, phonePeConfig.endpoints.pay);
    const fullUrl = `${phonePeConfig.baseUrl}${phonePeConfig.endpoints.pay}`;

    console.log("🔍 PhonePe V1 Init Request:", {
      url: fullUrl,
      merchantId: payload.merchantId,
      merchantTransactionId: payload.merchantTransactionId,
      xVerify: xVerify,
    });

    const response = await axios.post(
      fullUrl,
      { request: base64Payload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          accept: "application/json",
        },
        timeout: 10000,
      }
    );

    if (response.data && response.data.success) {
      const { url } = response.data.data.instrumentResponse.redirectInfo;

      // Upsert payment record
      await Payment.findOneAndUpdate(
        { orderId: orderId },
        {
          transactionId: transactionId,
          status: "pending",
          phonepeResponse: response.data,
          method: "PhonePe",
          userId: userId,
          amount: amount,
        },
        { new: true, upsert: true }
      );

      return res.status(200).json({
        success: true,
        data: {
          paymentUrl: url,
          transactionId: transactionId,
          orderId: orderId,
        },
      });
    } else {
      console.error(
        "❌ PhonePe Error Response:",
        JSON.stringify(response.data, null, 2)
      );
      throw new Error(response.data.message || "Failed to initiate payment");
    }
  } catch (error) {
    if (error.response) {
      console.error(
        "❌ PhonePe API Error (HTTP " + error.response.status + "):",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error("❌ PhonePe Network/Local Error:", error.message);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
      error: error.response?.data || error.message,
    });
  }
};

/**
 * Handle PhonePe Payment Callback (V1 Manual Flow)
 */
const phonePeCallback = async (req, res) => {
  try {
    const { response: base64Response } = req.body;
    const xVerify = req.headers["x-verify"] || req.headers["X-VERIFY"];

    if (!base64Response || !xVerify) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Missing response or x-verify header",
        });
    }

    // Verify Checksum
    const isValid = verifyCallbackChecksum(xVerify, base64Response);
    if (!isValid) {
      console.warn("⚠️ PhonePe V1 Callback: Invalid Checksum!");
      return res
        .status(401)
        .json({ success: false, message: "Checksum verification failed" });
    }

    const decoded = JSON.parse(
      Buffer.from(base64Response, "base64").toString()
    );
    const { success, code, data } = decoded;
    const { merchantTransactionId, transactionId } = data;

    console.log(`📞 PhonePe V1 Webhook Received. Status: ${code}`);

    const payment = await Payment.findOne({
      transactionId: merchantTransactionId,
    });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    if (success && code === "PAYMENT_SUCCESS") {
      payment.status = "success";
      payment.phonepeTransactionId = transactionId;
      payment.phonepeResponse = decoded;
      await payment.save();

      // Fetch order to check for coupon
      const order = await Order.findById(payment.orderId);

      // ATOMIC COUPON CONSUMPTION
      if (order && order.coupon && order.coupon.code) {
        const { consumeCoupon } = require("../../utils/couponValidation");

        const consumption = await consumeCoupon(
          order.coupon.code,
          order.subtotal || order.totalAmount,
          order.userId
        );

        if (!consumption.success) {
          console.warn(
            `⚠️ Coupon ${order.coupon.code} exhausted during payment. Error: ${consumption.error}`
          );

          // Remove coupon discount from order
          const newTotal = order.subtotal || order.totalAmount;
          await Order.findByIdAndUpdate(payment.orderId, {
            "coupon.applied": false,
            "coupon.errorCode": consumption.error,
            "coupon.errorMessage": consumption.message,
            totalAmount: newTotal,
            paymentStatus: "paid",
          });

          return res.status(400).json({
            success: false,
            message: consumption.message,
            errorCode: consumption.error,
            requiresRecalculation: true,
          });
        }

        console.log(
          `✅ Coupon ${order.coupon.code} consumed successfully for order ${payment.orderId}`
        );
      }

      await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: "paid" });
      return res
        .status(200)
        .json({ success: true, message: "Payment successful" });
    } else {
      payment.status = "failed";
      payment.phonepeResponse = decoded;
      await payment.save();

      await Order.findByIdAndUpdate(payment.orderId, {
        paymentStatus: "failed",
      });
      return res
        .status(200)
        .json({ success: true, message: "Payment failed marked" });
    }
  } catch (error) {
    console.error("❌ PhonePe V1 Callback Error:", error.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Callback processing failed",
        error: error.message,
      });
  }
};

/**
 * Check Payment Status (V1 Manual Flow)
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const endpoint = `${phonePeConfig.endpoints.status}/${phonePeConfig.merchantId}/${transactionId}`;

    // For status, payload is empty string
    const xVerify = generateXVerify("", endpoint);

    const response = await axios.get(`${phonePeConfig.baseUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerify,
        "X-MERCHANT-ID": phonePeConfig.merchantId,
        accept: "application/json",
      },
    });

    if (response.data && response.data.success) {
      const { code, data } = response.data;
      const payment = await Payment.findOne({ transactionId });

      if (payment) {
        if (code === "PAYMENT_SUCCESS") {
          payment.status = "success";
          payment.phonepeResponse = response.data;
          await payment.save();
          await Order.findByIdAndUpdate(payment.orderId, {
            paymentStatus: "paid",
          });
        } else if (code === "PAYMENT_ERROR") {
          payment.status = "failed";
          payment.phonepeResponse = response.data;
          await payment.save();
          await Order.findByIdAndUpdate(payment.orderId, {
            paymentStatus: "failed",
          });
        }
      }

      return res.status(200).json({ success: true, data: response.data });
    } else {
      return res
        .status(400)
        .json({
          success: false,
          message: "Failed to check payment status",
          data: response.data,
        });
    }
  } catch (error) {
    console.error(
      "❌ PhonePe V1 Status Check Error:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to check status",
        error: error.response?.data || error.message,
      });
  }
};

/**
 * Initiate Refund (V1 Manual Flow)
 */
const initiatePhonePeRefund = async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    const payment = await Payment.findOne({ orderId, status: "success" });

    if (!payment || !payment.phonepeTransactionId) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Success payment not found for refund",
        });
    }

    const refundId = `REF_${orderId}_${Date.now()}`;
    const payload = {
      merchantId: phonePeConfig.merchantId,
      merchantTransactionId: refundId,
      originalTransactionId: payment.transactionId,
      amount: Math.round(amount * 100), // paise
      callbackUrl: phonePeConfig.callbackUrl,
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      "base64"
    );
    const xVerify = generateXVerify(
      base64Payload,
      phonePeConfig.endpoints.refund
    );

    const response = await axios.post(
      `${phonePeConfig.baseUrl}${phonePeConfig.endpoints.refund}`,
      { request: base64Payload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          accept: "application/json",
        },
      }
    );

    if (response.data) {
      payment.phonepeRefundResponse = response.data;
      await payment.save();
      return res.status(200).json({ success: true, data: response.data });
    }
  } catch (error) {
    console.error(
      "❌ PhonePe V1 Refund Error:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({
        success: false,
        message: "Refund failed",
        error: error.response?.data || error.message,
      });
  }
};

/**
 * Check Refund Status (V1 Manual Flow)
 */
const getPhonePeRefundStatus = async (req, res) => {
  req.params.transactionId = req.params.refundId;
  return checkPaymentStatus(req, res);
};

module.exports = {
  initPhonePePayment,
  phonePeCallback,
  checkPaymentStatus,
  initiatePhonePeRefund,
  getPhonePeRefundStatus,
};
