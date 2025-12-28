const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    minCartValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscount: {
      type: Number, // Only for percentage type
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    usageLimit: {
      type: Number, // Global limit (e.g., first 100 users)
      default: null, // Null means unlimited
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isNewUserOnly: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient active coupon queries
couponSchema.index({ isActive: 1, endDate: 1 });
couponSchema.index({ code: 1 }, { unique: true });

// Virtual for dynamic status
couponSchema.virtual("status").get(function () {
  if (!this.isActive) return "PAUSED";
  if (new Date() > this.endDate) return "EXPIRED";
  if (this.usageLimit && this.usageCount >= this.usageLimit) return "DEPLETED";
  if (new Date() < this.startDate) return "SCHEDULED";
  return "ACTIVE";
});

// Ensure virtuals are included in JSON
couponSchema.set("toJSON", { virtuals: true });
couponSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Coupon", couponSchema);
