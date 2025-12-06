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

// Variant Schema (embedded)
const variantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    url_key: { type: String, required: true },
    sku: { type: String, required: true, unique: true, sparse: true },
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
    images: [{ type: String }],
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

// Detail Field Schema
const detailFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

// Detail Schema
const detailSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fields: [detailFieldSchema],
  },
  { _id: false }
);

// Product Schema
const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    url_key: { type: String, unique: true, sparse: true, index: true },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    variantOptions: [variantOptionSchema],
    variants: [variantSchema],
    details: [detailSchema],
    images: [{ type: String }],
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: [{ type: String }],
  },
  {
    timestamps: true,
    collection: "products",
  }
);

// Indexes
productSchema.index({ url_key: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ title: "text", description: "text" });

// Pre-save hook for URL key generation
productSchema.pre("save", function (next) {
  if (!this.url_key && this.title) {
    const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
    this.url_key = generateUniqueUrlKey(this.title);
  }
  next();
});

module.exports = mongoose.model("Product", productSchema);
