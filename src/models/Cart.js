// models/Cart.js
const mongoose = require("mongoose");

// Cart Item Schema (embedded in Cart)
// NOTE: Cart items NO LONGER store price snapshots.
// Prices are computed dynamically at runtime using product pricing rules.
// This ensures cart always reflects current pricing truth.
const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: {
      type: String, // Variant ID from product.variants array
      required: false, // Nullable for products without variants
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // Display snapshots (for cart UI, not for pricing)
    titleSnapshot: {
      type: String,
      required: true,
    },
    imageSnapshot: {
      type: String,
      required: true,
    },
    skuSnapshot: {
      type: String,
    },
    // Additional variant attributes snapshot
    attributesSnapshot: {
      type: Map,
      of: String,
    },
    // Gift slot selection (for BUNDLE products with gift_slot enabled)
    selectedGiftSku: {
      type: String,
      default: null,
    },
    // Free gift coupon injection markers
    isFreeGiftCoupon: { type: Boolean, default: false },
    freeGiftCouponCode: { type: String, default: null },
  },
  { _id: true, timestamps: false },
);

// Cart Schema
const cartSchema = new mongoose.Schema(
  {
    cartId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    items: [cartItemSchema],
    // Totals (calculated fields, can be cached)
    // Explicit pricing stages: baseSubtotal (MRP), productDiscountTotal, discountedSubtotal (after product discounts; use for coupon eligibility)
    baseSubtotal: { type: Number, default: 0, min: 0 },
    productDiscountTotal: { type: Number, default: 0, min: 0 },
    discountedSubtotal: { type: Number, default: 0, min: 0 },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Optional: tax and shipping estimates
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingEstimate: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Metadata
    // TTL index defined via cartSchema.index() below — do not add index:true here
    expiresAt: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      },
    },
    // Coupons Applied (supports stacking up to 2)
    coupons: [
      {
        code: { type: String },
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
        type: { type: String, default: "flat" }, // mirrors Coupon.type for fast reads
        discountAmount: { type: Number, default: 0 },
        minCartValue: { type: Number, default: 0 },
        // Per-line-item discount breakdown (Shopify-style)
        lineDiscounts: [
          {
            itemId: { type: String },
            amount: { type: Number, default: 0 },
          },
        ],
      },
    ],
    // Checkout State Machine
    status: {
      type: String,
      enum: ["active", "checkout", "ordered", "abandoned"],
      default: "active",
      index: true,
    },
    checkoutToken: {
      type: String,
      default: null,
    },
    checkoutStartedAt: {
      type: Date,
      default: null,
    },
    checkoutExpiry: {
      type: Date,
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Pre-validate middleware to handle deleted products
// When a product is deleted from the DB, calling populate('items.productId') sets it to null.
// This hook cleans up items with missing product references before validation schemas are checked,
// preventing 'Path `productId` is required' 500 errors.
cartSchema.pre("validate", function (next) {
  if (this.items && this.items.length > 0) {
    let changed = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      // If productId is null (meaning the product was deleted and then populated)
      if (this.items[i].productId == null) {
        this.items.pull(this.items[i]._id);
        changed = true;
      }
    }
    if (changed) {
      console.warn(
        `[Cart Pre-Validate] Cleaned up ${this.cartId}: removed items with deleted products`,
      );
    }
  }
  next();
});

// Pre-save middleware
// NOTE: Totals are no longer computed from stored price snapshots.
// They are computed dynamically by the controller using current product pricing.
// This hook only handles coupon clamping and total safety checks.
cartSchema.pre("save", function (next) {
  // Totals are managed by controller via calculateTotals()
  // which fetches products and computes pricing dynamically

  // Clamp each coupon's discount so total coupon deduction never exceeds discountedSubtotal
  if (this.coupons?.length > 0) {
    const maxTotal = this.discountedSubtotal ?? this.subtotal ?? 0;
    let remaining = maxTotal;
    for (const c of this.coupons) {
      if (c.discountAmount > remaining) {
        c.discountAmount = Math.max(0, remaining);
      }
      remaining = Math.max(0, remaining - c.discountAmount);
    }
  }

  // Final safety clamp
  if (this.total < 0) {
    this.total = 0;
  }

  next();
});

// Index for efficient queries
cartSchema.index({ userId: 1, cartId: 1 });
cartSchema.index({ userId: 1, status: 1 }); // For checkout flow
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to find or create cart
cartSchema.statics.findOrCreate = async function (cartId, userId = null) {
  let cart = await this.findOne({ cartId });
  if (!cart) {
    cart = await this.create({ cartId, userId });
  }
  return cart;
};

// Instance method to add item
// NOTE: No longer stores price snapshots - prices computed dynamically
cartSchema.methods.addItem = function (itemData) {
  const {
    productId,
    variantId,
    quantity,
    titleSnapshot,
    imageSnapshot,
    skuSnapshot,
    attributesSnapshot,
    selectedGiftSku,
  } = itemData;

  // Check if item already exists (same productId, variantId, AND selectedGiftSku)
  const existingItemIndex = this.items.findIndex(
    (item) =>
      item.productId.toString() === productId.toString() &&
      item.variantId === variantId &&
      item.selectedGiftSku === (selectedGiftSku || null),
  );

  if (existingItemIndex !== -1) {
    // Update quantity of existing item
    this.items[existingItemIndex].quantity += quantity;
  } else {
    // Add new item
    this.items.push({
      productId,
      variantId: variantId || null,
      quantity,
      titleSnapshot,
      imageSnapshot,
      skuSnapshot: skuSnapshot || null,
      attributesSnapshot: attributesSnapshot || null,
      selectedGiftSku: selectedGiftSku || null,
    });
  }

  return this.save();
};

// Instance method to update item quantity
cartSchema.methods.updateItemQuantity = function (itemId, quantity) {
  const item = this.items.id(itemId);
  if (!item) {
    throw new Error("Item not found in cart");
  }

  if (quantity <= 0) {
    // Remove item if quantity is 0 or less
    this.items.pull(itemId);
  } else {
    item.quantity = quantity;
  }

  return this.save();
};

// Instance method to remove item
cartSchema.methods.removeItem = function (itemId) {
  this.items.pull(itemId);
  return this.save();
};

// Instance method to clear all items
cartSchema.methods.clearItems = function () {
  this.items = [];
  return this.save();
};

module.exports = mongoose.model("Cart", cartSchema);
