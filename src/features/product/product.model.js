// Product Model - Mongoose Schema
const mongoose = require("mongoose");

// Variant Option Value Schema
const variantOptionValueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    value: { type: String, required: true },
    label: { type: String },
    hex: { type: String },
  },
  { _id: false }
);

// Variant Option Schema
const variantOptionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    values: [variantOptionValueSchema],
  },
  { _id: false }
);

// Image Metadata Schema
const imageMetadataSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    format: { type: String, required: true },
    size: { type: Number },
    alt: { type: String },
  },
  { _id: false }
);

// Variant Schema (embedded)
const variantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url_key: { type: String, required: true },
    sku: { type: String, required: true },
    skuLocked: { type: Boolean, default: false },
    price: { type: Number, min: 0 },
    discountPrice: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    pricing: {
      price: { type: Number, min: 0 },
      discountPrice: { type: Number, min: 0 },
    },
    stockObj: {
      available: { type: Number, default: 0, min: 0 },
      isInStock: { type: Boolean, default: true },
    },
    images: [imageMetadataSchema],
    options: { type: Map, of: String },
    attributes: { type: Map, of: String },
    weight: { type: Number },
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// Detail Field Schema (for details.fields array)
// Supported field types:
// 1. "text" - Simple label/value pair
// 2. "badges" - Array of badge strings
// 3. "flex_box" - Array of label/value objects (for grid display)
// 4. "list" - Array of strings (for bullet-point lists)
const detailFieldSchema = new mongoose.Schema(
  {
    label: { type: String }, // Required for "text" type, optional for others
    value: { type: mongoose.Schema.Types.Mixed }, // Type-specific: string for text, array for badges/flex_box/list
    type: {
      type: String,
      enum: ["badges", "flex_box", "list", "text"],
      default: "text",
    },
  },
  { _id: false }
);

// Detail Schema (for details array)
const detailSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // Section title
    fields: [detailFieldSchema], // Array of detail fields
    // Legacy fields - kept for backward compatibility
    badges: { type: Array, default: [] },
    flex_box: { type: Boolean, default: false },
  },
  { _id: false }
);

// URL Key History Schema
const urlKeyHistorySchema = new mongoose.Schema(
  {
    urlKey: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Product Schema
const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    description: { type: String, trim: true },
    shortDescription: { type: String, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    sku: { type: String, sparse: true, index: true },
    skuLocked: { type: Boolean, default: false },
    url_key: { type: String, unique: true, sparse: true, index: true },
    urlKeyHistory: [urlKeyHistorySchema],
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    variantOptions: [variantOptionSchema],
    variants: [variantSchema],
    details: [detailSchema],
    images: [imageMetadataSchema],
    tags: [{ type: String, trim: true }],
    price: { type: Number, min: 0 },
    discountPrice: { type: Number, min: 0 },
    currency: { type: String, default: "INR" },
    taxClass: { type: String, default: "standard" },
    stock: { type: Number, default: 0, min: 0 },
    weight: { type: Number, min: 0 },
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    shippingClass: { type: String },
    vendor: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    warranty: { type: String, trim: true },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    metaKeywords: [{ type: String }],
    visibility: {
      type: String,
      enum: ["public", "private", "hidden"],
      default: "public",
    },
    customAttributes: { type: Map, of: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

// Indexes
productSchema.index({ url_key: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ title: "text", description: "text" });
productSchema.index({ "variants.sku": 1 });

// Compound unique index for product SKU
productSchema.index({ sku: 1 }, { unique: true, sparse: true });

// Compound unique index for variant SKU across all products
productSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });

// Pre-save hook for URL key generation (only on creation)
productSchema.pre("save", async function (next) {
  if (this.isNew && !this.url_key && this.title) {
    try {
      const { generateUniqueUrlKey } = require("../../utils/slugGenerator");

      // Use mongoose.models to avoid recompilation
      const Product =
        mongoose.models.Product || mongoose.model("Product", productSchema);

      // Create a proper checkExists function
      const checkExists = async (urlKey) => {
        const existingProduct = await Product.findOne({ url_key: urlKey });
        return !!existingProduct;
      };

      this.url_key = await generateUniqueUrlKey(this.title, checkExists);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Force clear any cached model to ensure schema updates are applied
if (mongoose.connection.models.Product) {
  delete mongoose.connection.models.Product;
}
if (mongoose.models.Product) {
  delete mongoose.models.Product;
}

// Export using singleton pattern to prevent duplicate compilation
module.exports = mongoose.model("Product", productSchema);
