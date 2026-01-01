const mongoose = require("mongoose");
const { STOCK_NOTIFICATION_STATUS } = require("../../resources/constants");

const stockNotificationSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantId: {
      type: String, // String ID as used in Product variants
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "is invalid"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    productName: {
      type: String, // Store snapshot for email context
    },
    variantName: {
      type: String, // Store snapshot for email context
    },
    status: {
      type: String,
      enum: Object.values(STOCK_NOTIFICATION_STATUS),
      default: STOCK_NOTIFICATION_STATUS.PENDING,
      index: true,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index to ensure one pending request per email per variant
stockNotificationSchema.index(
  { email: 1, productId: 1, variantId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: STOCK_NOTIFICATION_STATUS.PENDING },
  }
);

module.exports = mongoose.model("StockNotification", stockNotificationSchema);
