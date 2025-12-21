const {
  razorpayInstance,
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require("../../config/razorpay");
const Order = require("../../models/Order");
const Payment = require("../../models/Payment");
const Cart = require("../../models/Cart");

/**
 * Create Razorpay Order
 * This creates a Razorpay order and returns order ID for frontend
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId, amount, userId } = req.body;

    if (!orderId || !amount || !userId) {
      return res.status(400).json({
        success: false,
        message: "Order ID, amount, and user ID are required",
      });
    }

    // Verify order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Amount in paise (smallest currency unit)
      currency: "INR",
      receipt: `order_${orderId}`,
      notes: {
        orderId: orderId,
        userId: userId,
      },
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    // Update payment record with Razorpay order ID
    await Payment.findOneAndUpdate(
      { orderId: orderId },
      {
        transactionId: razorpayOrder.id,
        razorpayOrderId: razorpayOrder.id,
        status: "pending",
        razorpayResponse: razorpayOrder,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        orderId: orderId,
        keyId: process.env.RAZORPAY_KEY_ID, // Frontend needs this
      },
    });
  } catch (error) {
    console.error("❌ Razorpay order creation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error: error.message,
    });
  }
};

/**
 * Verify Razorpay Payment
 * Called by frontend after user completes payment
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required payment verification parameters",
      });
    }

    // Verify signature
    const isValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      // Update payment as failed
      await Payment.findOneAndUpdate(
        { orderId: orderId },
        {
          status: "failed",
          razorpayPaymentId: razorpay_payment_id,
        }
      );

      await Order.findByIdAndUpdate(orderId, {
        paymentStatus: "failed",
      });

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Signature is valid - update payment as successful
    const payment = await Payment.findOneAndUpdate(
      { orderId: orderId },
      {
        status: "success",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      },
      { new: true }
    );

    // Update order payment status
    const order = await Order.findByIdAndUpdate(orderId, {
      paymentStatus: "paid",
    });

    // Clear user's cart after successful payment
    if (order && order.userId) {
      await Cart.deleteMany({ userId: order.userId });
      console.log(
        `🗑️  Cleared cart for user ${order.userId} after successful payment`
      );
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      paymentId: payment._id,
      orderId: orderId,
    });
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message,
    });
  }
};

/**
 * Razorpay Webhook Handler
 * Handles payment events from Razorpay
 */
const razorpayWebhook = async (req, res) => {
  try {
    // Get signature from header
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    const isValid = verifyWebhookSignature(payload, signature);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    // Process webhook event
    const event = req.body.event;
    const paymentData = req.body.payload.payment.entity;

    console.log("📞 Razorpay Webhook received:", event);

    // Handle different events
    switch (event) {
      case "payment.captured":
        // Payment successful
        const payment = await Payment.findOne({
          razorpayPaymentId: paymentData.id,
        });

        if (payment) {
          payment.status = "success";
          payment.razorpayResponse = paymentData;
          await payment.save();

          await Order.findByIdAndUpdate(payment.orderId, {
            paymentStatus: "paid",
          });

          console.log("✅ Payment captured:", paymentData.id);
        }
        break;

      case "payment.failed":
        // Payment failed
        const failedPayment = await Payment.findOne({
          razorpayPaymentId: paymentData.id,
        });

        if (failedPayment) {
          failedPayment.status = "failed";
          failedPayment.razorpayResponse = paymentData;
          await failedPayment.save();

          await Order.findByIdAndUpdate(failedPayment.orderId, {
            paymentStatus: "failed",
          });

          console.log("❌ Payment failed:", paymentData.id);
        }
        break;

      default:
        console.log("ℹ️ Unhandled event:", event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

/**
 * Get Payment Details
 * Fetch payment details from Razorpay
 */
const getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }

    // Fetch from Razorpay
    const payment = await razorpayInstance.payments.fetch(paymentId);

    return res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("❌ Fetch payment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment details",
      error: error.message,
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
  getPaymentDetails,
};
