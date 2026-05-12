const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "staff"], required: true },
    content: { type: String, required: true },
    // Product cards the AI suggested (stored for re-render)
    products: [
      {
        id: String,
        title: String,
        url_key: String,
        image: String,
        regular_price: Number,
        offer_price: Number,
      },
    ],
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: ["active", "escalated", "resolved", "closed"],
      default: "active",
      index: true,
    },
    escalationReason: { type: String, default: null },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    messages: [messageSchema],
    resolvedAt: { type: Date, default: null },
    // Snapshot of customer info for dashboard display
    customerName: { type: String, default: "Guest" },
    customerEmail: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatSession", chatSessionSchema);
