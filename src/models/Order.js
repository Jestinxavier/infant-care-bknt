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

    // GST snapshot (set only when GST was enabled when the order was placed)
    hsnCode: { type: String },
    gstRate: { type: Number },
    taxableValue: { type: Number },
    taxAmount: { type: Number },
  },
  { _id: false },
);

// GST worked out when the order was placed, so later changes to rates or
// settings never alter an existing invoice. Absent on orders placed before GST
// was enabled; those keep showing invoices without tax figures.
const orderGstSchema = new mongoose.Schema(
  {
    pricesIncludeTax: { type: Boolean, default: true },
    sellerGstin: { type: String, default: "" },
    sellerState: { type: String, default: "" },
    placeOfSupply: { type: String, default: "" },
    supplyType: { type: String, enum: ["intra", "inter"] },
    taxableValue: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    // Shipping + COD fee, taxed at the highest item rate
    chargesRate: { type: Number, default: 0 },
    chargesTaxableValue: { type: Number, default: 0 },
    chargesTax: { type: Number, default: 0 },
    invoiceNumber: { type: String, default: null },
    invoiceDate: { type: Date, default: null },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
    },
    // Guest checkout fields (populated when userId is null)
    isGuestOrder: { type: Boolean, default: false, index: true },
    guestInfo: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
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
    codCost: {
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
    // All applied coupons (stacking support); coupon above kept for backward compat
    coupons: [
      {
        code: String,
        couponId: mongoose.Schema.Types.ObjectId,
        discountAmount: Number,
      },
    ],
    gst: { type: orderGstSchema, default: undefined },
    // addressId removed as per request (full address stored in shippingAddress)
    shippingAddress: {
      name: String,
      fullName: String,
      phone: String,
      houseName: String,
      street: String,
      additionalInstruction: String,
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
    // Set when the first order-confirmation email is claimed for sending, so
    // repeated payment notifications (PhonePe redirect + webhook + retries)
    // can't email the customer the same confirmation more than once.
    confirmationEmailSentAt: { type: Date, default: null },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "returned",
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
    // Razorpay order created for this order at checkout. Signature verification
    // must match against this so a valid payment for one order can't be
    // replayed to mark a different order as paid.
    razorpayOrderId: {
      type: String,
      default: null,
    },
    // Refund tracking (populated when a refund is initiated via PhonePe)
    // States mirror PhonePe's actual refund lifecycle:
    //   PENDING   → Refund submitted, being processed
    //   CONFIRMED → In progress, not yet final
    //   COMPLETED → Successfully refunded to customer
    //   FAILED    → Refund failed, must be retried with a new merchantRefundId
    refundStatus: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "COMPLETED", "FAILED"],
      default: null,
    },
    refundId: {
      type: String,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundReason: {
      type: String,
      default: null,
    },
    refundAmountPaise: {
      type: Number,
      default: null,
    },
    // Running total across all refunds (partial refunds accumulate here).
    // The order is only marked refunded/cancelled once this reaches the total.
    refundedAmountPaise: {
      type: Number,
      default: 0,
    },
    // Set while a refund is being sent to the gateway so a concurrent request
    // can't initiate a second refund for the same order.
    refundLockedAt: {
      type: Date,
      default: null,
    },
    // Each failed or successful refund attempt is pushed here (supports retries)
    refundAttempts: [
      {
        merchantRefundId: { type: String },
        state: { type: String },
        amountPaise: { type: Number },
        initiatedAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null },
      },
    ],
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
            "returned",
            "cancelled",
          ],
          required: true,
        },
        timestamp: { type: Date, default: Date.now },
        note: { type: String },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Optional: track who updated it
      },
    ],
    // Meta Conversions API (CAPI) tracking and deduplication
    metaTracking: {
      fbp: { type: String, default: null },
      fbc: { type: String, default: null },
      eventSourceUrl: { type: String, default: null },
      clientIp: { type: String, default: null },
      clientUserAgent: { type: String, default: null },
    },
    metaPurchaseSent: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

orderSchema.index({ userId: 1, placedAt: -1 });
// Storefront order-history filters by userId and sorts by createdAt.
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ isGuestOrder: 1, "guestInfo.email": 1, orderId: 1 });
orderSchema.index({ userId: 1, orderStatus: 1, placedAt: -1 });
orderSchema.index({ orderStatus: 1, placedAt: -1 });
// Dashboard aggregations use createdAt (from timestamps: true), not placedAt
orderSchema.index({ createdAt: -1, orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ phonepeTransactionId: 1 }, { sparse: true });
// Invoice numbers must never repeat.
orderSchema.index(
  { "gst.invoiceNumber": 1 },
  { unique: true, partialFilterExpression: { "gst.invoiceNumber": { $type: "string" } } },
);

module.exports = mongoose.model("Order", orderSchema);
