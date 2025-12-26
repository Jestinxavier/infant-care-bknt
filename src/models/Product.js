// models/Product.js
const mongoose = require("mongoose");

// Variant Option Schema (for variantOptions array)
const variantOptionValueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    value: { type: String, required: true },
    label: { type: String },
    code: { type: String, uppercase: true }, // ✅ NEW: Short code for SKU generation (e.g., 'RD', 'M', '03M')
    hex: { type: String }, // For color variants
    metadata: { type: Map, of: String }, // ✅ NEW: Additional metadata (image_url, etc.)
  },
  { _id: false }
);

const variantOptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    values: [variantOptionValueSchema],
    position: { type: Number, default: 0 }, // ✅ NEW: Display order
  },
  { _id: false }
);

// Variant Schema (embedded in Product)
const variantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url_key: { type: String, required: true }, // Unique URL key for this variant
    sku: { type: String, required: true, unique: true, sparse: true },
    // Support both formats: direct fields and nested objects
    price: { type: Number, min: 0 }, // Direct price (for backward compatibility)
    discountPrice: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 }, // Direct stock
    // Nested pricing object (new format)
    pricing: {
      price: { type: Number, min: 0 },
      discountPrice: { type: Number, min: 0 },
    },
    // Nested stock object (new format)
    stockObj: {
      available: { type: Number, default: 0, min: 0 },
      isInStock: { type: Boolean, default: true },
    },
    images: [{ type: String }],
    // Support both 'options' and 'attributes' (new format uses attributes)
    options: { type: Map, of: String }, // Legacy: Map of option code to value
    attributes: { type: Map, of: String }, // New: Map of attribute name to value (e.g., {color: "red", size: "6-9"})
    weight: { type: Number },
    length: { type: Number },
    height: { type: Number },
    width: { type: Number },
    width: { type: Number },
    _optionsHash: { type: String }, // ✅ NEW: Hash of options for duplicate detection
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // ✅ NEW: Reference to parent product
  },
  { _id: false }
);

// Detail Field Schema - Used across all section types
// For description type: { type: "list" | "badge", data: [...] }
// For grid/pair types: { label: "...", value: "..." }
const detailFieldSchema = new mongoose.Schema(
  {
    // For list/badge/text items in description sections
    type: {
      type: String,
      enum: ["list", "badge", "text"],
    },
    data: [{ type: String }],

    // For grid/pair label-value pairs
    label: { type: String },
    value: { type: String },
  },
  { _id: false, strict: false }
);

// Detail Section Schema
// Supports three section types:
// 1. "description" - Has description text + fields array with list/badge items
// 2. "grid" - Has fields array with label-value pairs (displayed in grid)
// 3. "pair" - Has fields array with label-value pairs (displayed as pairs)
const detailSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["description", "grid", "pair"],
      // Made optional for backward compatibility with old data
    },
    // For description type
    description: { type: String },
    // For all types (structure differs based on type)
    fields: [detailFieldSchema],
  },
  { _id: false, strict: false }
);

const productSchema = new mongoose.Schema(
  {
    // Primary fields
    title: { type: String, required: true },
    description: String,

    // Category reference (ObjectId for MongoDB relationship)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    categoryName: { type: String }, // Store category name for convenience
    categoryCode: { type: String, index: true }, // Store category code (e.g., 'baby-clothes')

    // URL and status
    url_key: {
      type: String,
      unique: true,
      sparse: true,
    },

    // SKU (Stock Keeping Unit) - optional for simple products, required for variant-based products
    sku: {
      type: String,
      unique: true,
      sparse: true, // Allow null/undefined values and only enforce uniqueness when present
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },

    // Product-level pricing (parent level)
    pricing: {
      price: { type: Number, min: 0 },
      discountPrice: { type: Number, min: 0 },
    },

    // Product-level stock (parent level)
    stockObj: {
      available: { type: Number, default: 0, min: 0 },
      isInStock: { type: Boolean, default: true },
    },

    // Product-level images
    images: [{ type: String }],

    // Variant structure
    variantOptions: [variantOptionSchema],
    variants: [variantSchema],

    // Details array
    details: [detailSchema],

    // Rating fields (aggregated from all variants) - DO NOT allow manual input
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },

    // Legacy fields (for backward compatibility)
    name: { type: String }, // Auto-synced from title
    tags: String,
    basePrice: Number,

    // SEO fields
    metaTitle: { type: String },
    metaDescription: { type: String },

    // ✅ NEW: UI Metadata for frontend (e.g. hex codes)
    uiMeta: { type: Object }, // Flexible object structure for { color: { red: { hex: "#..." } } }

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Pre-save middleware to sync name with title for backward compatibility
productSchema.pre("save", function (next) {
  // Always sync name from title (title is primary)
  if (this.title) {
    this.name = this.title;
  }
  // Only use name if title is missing (backward compatibility)
  if (!this.title && this.name) {
    this.title = this.name;
  }
  next();
});

// Index for url_key lookups
productSchema.index({ url_key: 1 });

module.exports = mongoose.model("Product", productSchema);
