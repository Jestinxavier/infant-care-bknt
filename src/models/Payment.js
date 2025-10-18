// models/Payment.js
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ["COD", "Razorpay", "Stripe", "Wallet", "PhonePe"], required: true },
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  transactionId: { type: String }, // from gateway if online
  
  // PhonePe fields
  phonepeTransactionId: { type: String }, // PhonePe transaction ID
  phonepeResponse: { type: Object }, // Store PhonePe response data
  
  // Razorpay fields
  razorpayOrderId: { type: String }, // Razorpay order ID
  razorpayPaymentId: { type: String }, // Razorpay payment ID
  razorpaySignature: { type: String }, // Razorpay signature
  razorpayResponse: { type: Object }, // Store Razorpay response data
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", paymentSchema);
