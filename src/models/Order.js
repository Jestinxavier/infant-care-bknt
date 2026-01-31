// models/Order.js
const mongoose = require("mongoose");
const { PAYMENT_METHODS } = require("../../resources/constants");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true, // Sold Price (after product discount)
    },
    regularPrice: {
      type: Number,
      default: 0, // MRP / Original Price
    },
    // Product Snapshot Details
    name: { type: String, required: true },
    sku: { type: String },
    image: { type: String },
    urlKey: { type: String },

    // Variant Snapshot Details (if applicable)
    variantName: { type: String },
    variantSku: { type: String },
    variantImage: { type: String },
    variantUrlKey: { type: String },
    variantAttributes: {
      type: Map,
      of: String,
    },
    // Gift Slot Data (bundle with gift choice)
    selectedGiftSku: { type: String },
    selectedGift: {
      sku: String,
      label: String,
      image: String,
      title: String,
    },
    isGift: { type: Boolean, default: false },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: String,
      unique: true,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true, // Allow null values, only enforce uniqueness when present
      index: true,
    },
    cartId: {
      type: String,
      required: false, // Optional for now to maintain backward compatibility (or true if we strictly enforce it)
    },
    items: [orderItemSchema],
    totalQuantity: {
      // Total count of items
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    coupon: {
      code: String,
      couponId: mongoose.Schema.Types.ObjectId,
      discountAmount: Number,
    },
    // addressId removed as per request (full address stored in shippingAddress)
    shippingAddress: {
      name: String,
      fullName: String,
      phone: String,
      houseName: String,
      street: String,
      landmark: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      district: String,
      pincode: String,
      country: String,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    trackingId: {
      type: String,
      default: "",
    },
    deliveryNote: {
      type: String,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: PAYMENT_METHODS.PHONEPE,
    },
    phonepeTransactionId: {
      type: String,
      default: null,
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
    deliveryPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryPartner",
      default: null,
    },
    fulfillmentAdditionalInfo: [
      {
        key: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
          ],
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
        note: { type: String },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Optional: track who updated it
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
