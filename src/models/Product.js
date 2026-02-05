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
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttributeDefinition",
      required: true,
    }, // ✅ REQUIRED: Reference to global attribute
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
    url_key: { type: String }, // Made optional in schema, controller will generate
    sku: { type: String, unique: true, sparse: true },
    price: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    // Offer pricing (discountPrice is computed at runtime, not stored)
    offerPrice: { type: Number, min: 0 },
    offerStartAt: { type: Date },
    offerEndAt: { type: Date },
    // Quantity-based tiered pricing (overrides product-level rules if defined)
    quantityRules: [
      {
        minQty: { type: Number, required: true, min: 2 },
        price: { type: Number, required: true, min: 0.01 },
      },
    ],
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

// Gift Option Schema (for bundle_config.gift_slot.options)
const giftOptionSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    label: { type: String, required: true }, // Display label e.g., "Free Socks"
  },
  { _id: false }
);

// Gift Slot Schema (for bundle_config.gift_slot)
// Allows bundles to offer a customer choice of free gifts
const giftSlotSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    qty: { type: Number, default: 1, min: 1 }, // How many of the selected gift
    options: {
      type: [giftOptionSchema],
      default: [],
      validate: {
        validator: function (v) {
          // If enabled, must have at least 2 gift choices
          if (this.enabled) return v.length >= 2;
          return true;
        },
        message: "Gift slot must contain at least 2 gift options when enabled.",
      },
    },
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
    subCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

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

    // Product Type: SIMPLE (no variants), CONFIGURABLE (has variants), BUNDLE (fixed bundle), CHOICE_GROUP (gift choice)
    product_type: {
      type: String,
      enum: ["SIMPLE", "CONFIGURABLE", "BUNDLE", "CHOICE_GROUP"],
      default: "SIMPLE",
      index: true,
    },

    // Bundle configuration (only for BUNDLE product_type)
    bundle_config: {
      pricing: { type: String, enum: ["FIXED"], default: "FIXED" },
      items: [
        {
          sku: { type: String, required: true },
          title: { type: String }, // Product title for display
          url_key: { type: String }, // Product URL key for linking
          qty: { type: Number, required: true, min: 1 },
          isFree: { type: Boolean, default: false }, // Mark item as free in bundle
        },
      ],
      // Gift Choice Slot - allows customer to pick one free gift from options
      gift_slot: {
        type: giftSlotSchema,
        default: { enabled: false },
      },
    },

    // choice_config REMOVED - Legacy structure replaced by bundle_config.gift_slot

    // Product-level pricing (discountPrice is computed at runtime, not stored)
    price: { type: Number, min: 0 },
    offerPrice: { type: Number, min: 0 },
    offerStartAt: { type: Date },
    offerEndAt: { type: Date },

    // Quantity-based tiered pricing (not applicable to BUNDLE products)
    quantityRules: [
      {
        minQty: { type: Number, required: true, min: 2 },
        price: { type: Number, required: true, min: 0.01 },
      },
    ],

    // Product-level stock (parent level)
    stockObj: {
      available: { type: Number, default: 0, min: 0 },
      isInStock: { type: Boolean, default: true },
    },

    // Product-level images (same type as variant.images - array of URL strings)
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
    tags: String, // Single string value (e.g., 'new-arrival')
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

  // ✅ VALIDATION: Ensure no duplicate variants based on _optionsHash
  if (this.variants && this.variants.length > 0) {
    const hashes = new Set();
    for (const variant of this.variants) {
      if (variant._optionsHash) {
        if (hashes.has(variant._optionsHash)) {
          return next(
            new Error(
              `Duplicate variant configuration detected. Options Hash: ${variant._optionsHash}`
            )
          );
        }
        hashes.add(variant._optionsHash);
      }
    }
  }

  next();
});

// Index for url_key lookups
productSchema.index({ url_key: 1 });

// ✅ NEW: Unique index to prevent duplicate variants within the same parent product
// Note: Sparse is needed because non-variant products (SIMPLE) won't have parentId or _optionsHash on the parent level
// But wait, variants are embedded. We can't index embedded docs like this easily for uniqueness across array elements in Mongo < ???
// Correction: Mongoose/Mongo doesn't support unique index on array of embedded objects like this easily without specific "variants.sku" syntax.
// However, the USER Requirement 8 says: "Unique index on { productId, _optionsHash }".
// Since variants are EMBEDDED in `Product` model, this requirement implies `_optionsHash` is unique *within the variants array*.
// MongoDB cannot strictly enforce array uniqueness via standard index. Ideally, this logic lives in the controller (which we have in `createProduct` and `bulkImport`).
// BUT if the request implies a separate collection or specific schema validation:
// "Hash includes sorted attribute/value pairs. Result: no duplicate variants — ever."
// Given the current schema is EMBEDDED, I will add a pre-save hook to enforce this uniqueness logic since a DB index on embedded array elements for checking distinctness relative to siblings is complex.
// Actually, user might mean "Product Uniqueness" if modeled differently, but here it is embedded.
// I will implement the PRE-SAVE VALIDATION for this.

// Create index for fast lookups
productSchema.index({ "variants.sku": 1 });
productSchema.index({ "variants._optionsHash": 1 });

// Force clear any cached model to ensure schema updates are applied
if (mongoose.connection.models.Product) {
  delete mongoose.connection.models.Product;
}
if (mongoose.models.Product) {
  delete mongoose.models.Product;
}

module.exports = mongoose.model("Product", productSchema);
