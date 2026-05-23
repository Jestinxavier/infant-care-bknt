const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["new_order", "order_update", "system"],
      default: "new_order",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    orderId: { type: String, default: null }, // Short order ID (e.g. "AB12CD34")
    orderDbId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    // Auto-expire: TTL index removes documents 24h after createdAt
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Useful query index
notificationSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
