// models/Cart.js
const mongoose = require("mongoose");

// Cart Item Schema (embedded in Cart)
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
    // Snapshots to preserve data at time of adding to cart
    priceSnapshot: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPriceSnapshot: {
      type: Number,
      min: 0,
    },
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
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate totals
cartSchema.pre("save", function (next) {
  // Calculate subtotal from items
  this.subtotal = this.items.reduce((sum, item) => {
    const price = item.discountPriceSnapshot || item.priceSnapshot;
    return sum + price * item.quantity;
  }, 0);

  // Calculate total (subtotal + tax + shipping)
  this.total = this.subtotal + (this.tax || 0) + (this.shippingEstimate || 0);

  next();
});

// Index for efficient queries
cartSchema.index({ userId: 1, cartId: 1 });
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
cartSchema.methods.addItem = function (itemData) {
  const {
    productId,
    variantId,
    quantity,
    priceSnapshot,
    discountPriceSnapshot,
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
      priceSnapshot,
      discountPriceSnapshot: discountPriceSnapshot || null,
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
