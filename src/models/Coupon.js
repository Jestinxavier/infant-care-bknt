const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true, // unique:true already creates the index — no index:true needed
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["flat", "percentage", "free_gift"],
      required: true,
    },
    value: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    // Only for type === "free_gift"
    freeGift: {
      triggerProductIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      ],
      triggerMinQty: { type: Number, default: 1, min: 1 },
      // "product" = item exists in catalog; "custom" = physical promo gift not in catalog
      giftType: { type: String, enum: ["product", "custom"], default: "product" },
      giftProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      giftLabel: { type: String, trim: true }, // used when giftType === "custom"
      giftQty: { type: Number, default: 1, min: 1 },
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
    // When false, coupon is excluded from the public available-coupons list
    // but can still be redeemed by entering the code manually
    isPublic: {
      type: Boolean,
      default: true,
    },
    // Product scope: 'all' = entire cart, 'specific_products' = only matching items
    applicableTo: {
      type: String,
      enum: ["all", "category", "specific_products"],
      default: "all",
    },
    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    applicableProductIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
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
