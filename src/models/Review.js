const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: { type: String, default: null }, // Match order variantId (string or null)
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: "" },
    reply: { type: String, default: "" },
    isReplied: { type: Boolean, default: false },
    repliedAt: { type: Date },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isApproved: { type: Boolean, default: false },
    isGuest: { type: Boolean, default: false },
    guestName: { type: String, trim: true },
    guestEmail: { type: String, trim: true, lowercase: true },
  },
  { timestamps: true },
);

reviewSchema.index({ productId: 1, status: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ status: 1 });
// Rating/review reads filter on isApproved (not status) and sort by createdAt.
reviewSchema.index({ productId: 1, isApproved: 1, createdAt: -1 });
reviewSchema.index({ variantId: 1, isApproved: 1, createdAt: -1 });
// Prevents a user from submitting two reviews for the same product+order combination
reviewSchema.index(
  { userId: 1, productId: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "objectId" } } },
);
// Prevent guests from submitting multiple reviews for the same product+order
reviewSchema.index(
  { orderId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { isGuest: true } },
);

module.exports = mongoose.model("Review", reviewSchema);
