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
    _optionsHash: { type: String }, // ✅ NEW: Hash of options for duplicate detection
  },
  { _id: false }
);

// Detail Field Schema (for details.fields array)
// Supported field types:
// 1. "text" - Simple label/value pair
//    Example: { type: "text", label: "Material", value: "100% Cotton" }
// 2. "badges" - Array of badge strings
//    Example: { type: "badges", value: ["Soft", "Breathable"] }
// 3. "flex_box" - Array of label/value objects (for grid display)
//    Example: { type: "flex_box", value: [{ label: "Pattern", value: "Embroidered" }] }
const detailFieldSchema = new mongoose.Schema(
  {
    label: { type: String }, // Required for "text" type, optional for others
    value: { type: mongoose.Schema.Types.Mixed }, // Type-specific: string for text, array for badges/flex_box
    type: {
      type: String,
      enum: ["badges", "flex_box", "text"],
      default: "text",
    },
  },
  { _id: false }
);

// Detail Schema (for details array)
// Structure: [{ title: "Section Title", fields: [...] }]
const detailSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Section title (e.g., "Product Details", "Care Instructions")
    fields: [detailFieldSchema], // Array of detail fields
    // Legacy fields - kept for backward compatibility, should not be used in new products
    label: { type: String },
    value: { type: String },
    badges: [{ type: String }],
    flex_box: { type: Boolean, default: false },
  },
  { _id: false }
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
