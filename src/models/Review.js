const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant", required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  review: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Review", reviewSchema);
