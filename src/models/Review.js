const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: String, default: null }, // Match order variantId (string or null)
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  review: { type: String, default: "" },
  reply: { type: String, default: "" },
  isReplied: { type: Boolean, default: false },
  repliedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Review", reviewSchema);
