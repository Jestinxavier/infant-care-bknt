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
  },
  { _id: true, timestamps: false }
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
    expiresAt: {
      type: Date,
      // Default: 30 days from creation for abandoned carts
      default: function () {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      },
      index: { expireAfterSeconds: 0 }, // TTL index for auto-deletion
    },
    // Coupon Applied
    coupon: {
      code: { type: String },
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
      discountAmount: { type: Number, default: 0 },
    },
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
  }
);

// Pre-save middleware
// NOTE: Totals are no longer computed from stored price snapshots.
// They are computed dynamically by the controller using current product pricing.
// This hook only handles coupon clamping and total safety checks.
cartSchema.pre("save", function (next) {
  // Totals are managed by controller via calculateTotals()
  // which fetches products and computes pricing dynamically

  // Apply Coupon Discount clamping (if any)
  if (this.coupon && this.coupon.discountAmount > 0) {
    // Ensure we don't discount more than the subtotal
    if (this.coupon.discountAmount > this.subtotal) {
      this.coupon.discountAmount = this.subtotal; // Clamp
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
  } = itemData;

  // Check if item already exists (same productId and variantId)
  const existingItemIndex = this.items.findIndex(
    (item) =>
      item.productId.toString() === productId.toString() &&
      item.variantId === variantId
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
