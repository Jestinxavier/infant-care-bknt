const axios = require('axios');
const crypto = require('crypto');
const { phonePeConfig, generateChecksum, verifyChecksum } = require('../../config/phonepe');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');

/**
 * Initialize PhonePe Payment
 * Creates a payment request and returns the payment URL
 */
const initPhonePePayment = async (req, res) => {
  try {
    const { orderId, amount, userId, userPhone, userName } = req.body;

    if (!orderId || !amount || !userId) {
      return res.status(400).json({
        success: false,
        message: "Order ID, amount, and user ID are required"
      });
    }

    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Generate unique transaction ID
    const transactionId = `TXN_${orderId}_${Date.now()}`;
    const merchantUserId = `USER_${userId}`;

    // Prepare PhonePe payment payload
    const paymentPayload = {
      merchantId: phonePeConfig.merchantId,
      merchantTransactionId: transactionId,
      merchantUserId: merchantUserId,
      amount: Math.round(amount * 100), // Convert to paise (smallest currency unit)
      redirectUrl: `${phonePeConfig.redirectUrl}?orderId=${orderId}`,
      redirectMode: 'POST',
      callbackUrl: phonePeConfig.callbackUrl,
      mobileNumber: userPhone || '',
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // Encode payload to Base64
    const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    // Generate checksum
    const checksum = generateChecksum(base64Payload);

    // Make API call to PhonePe
    const response = await axios.post(
      `${phonePeConfig.apiEndpoint}/pg/v1/pay`,
      {
        request: base64Payload
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum
        }
      }
    );

    if (response.data.success) {
      // Update payment record with transaction ID
      await Payment.findOneAndUpdate(
        { orderId: orderId },
        {
          transactionId: transactionId,
          status: 'pending',
          phonepeResponse: response.data
        },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Payment initiated successfully",
        data: {
          paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
          transactionId: transactionId,
          orderId: orderId
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to initiate payment",
        error: response.data.message
      });
    }

  } catch (error) {
    console.error("❌ PhonePe payment init error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
      error: error.response?.data || error.message
    });
  }
};

/**
 * Handle PhonePe Payment Callback
 * Called by PhonePe after payment completion
 */
const phonePeCallback = async (req, res) => {
  try {
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({
        success: false,
        message: "Invalid callback data"
      });
    }

    // Decode the base64 response
    const decodedResponse = JSON.parse(Buffer.from(response, 'base64').toString());
    
    const { merchantTransactionId, transactionId, amount, state, responseCode } = decodedResponse;

    console.log("📞 PhonePe Callback received:", decodedResponse);

    // Find payment by transaction ID
    const payment = await Payment.findOne({ transactionId: merchantTransactionId });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Update payment status based on PhonePe response
    if (state === 'COMPLETED' && responseCode === 'SUCCESS') {
      payment.status = 'success';
      payment.phonepeTransactionId = transactionId;
      payment.phonepeResponse = decodedResponse;
      
      // Update order payment status
      await Order.findByIdAndUpdate(payment.orderId, {
        paymentStatus: 'paid'
      });

      await payment.save();

      return res.status(200).json({
        success: true,
        message: "Payment successful",
        paymentId: payment._id
      });
    } else {
      payment.status = 'failed';
      payment.phonepeResponse = decodedResponse;
      
      await Order.findByIdAndUpdate(payment.orderId, {
        paymentStatus: 'failed'
      });

      await payment.save();

      return res.status(400).json({
        success: false,
        message: "Payment failed",
        reason: decodedResponse.message
      });
    }

  } catch (error) {
    console.error("❌ PhonePe callback error:", error);
    return res.status(500).json({
      success: false,
      message: "Callback processing failed",
      error: error.message
    });
  }
};

/**
 * Check Payment Status
 * Manually verify payment status with PhonePe
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID is required"
      });
    }

    // Generate checksum for status check
    const statusEndpoint = `/pg/v1/status/${phonePeConfig.merchantId}/${transactionId}`;
    const checksum = crypto
      .createHash('sha256')
      .update(statusEndpoint + phonePeConfig.saltKey)
      .digest('hex') + '###' + phonePeConfig.saltIndex;

    // Check status from PhonePe
    const response = await axios.get(
      `${phonePeConfig.apiEndpoint}${statusEndpoint}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': phonePeConfig.merchantId
        }
      }
    );

    if (response.data.success) {
      const paymentData = response.data.data;
      
      // Update local payment record
      const payment = await Payment.findOne({ transactionId: transactionId });
      if (payment) {
        if (paymentData.state === 'COMPLETED') {
          payment.status = 'success';
          await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'paid' });
        } else if (paymentData.state === 'FAILED') {
          payment.status = 'failed';
          await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'failed' });
        }
        payment.phonepeResponse = paymentData;
        await payment.save();
      }

      return res.status(200).json({
        success: true,
        message: "Payment status retrieved",
        data: paymentData
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Failed to check payment status"
      });
    }

  } catch (error) {
    console.error("❌ Payment status check error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to check payment status",
      error: error.response?.data || error.message
    });
  }
};

module.exports = {
  initPhonePePayment,
  phonePeCallback,
  checkPaymentStatus
};
