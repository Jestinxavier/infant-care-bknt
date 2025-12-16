// models/Variant.js
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    color: { type: String },
    age: { type: String },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    sku: { type: String, unique: true },
    images: [{ type: String }], // URLs
    attributes: { type: Map, of: String }, // Flexible attributes (e.g., size: "M", material: "Cotton")
    options: [{ name: String, value: String }], // Structured options
    // Rating fields
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Variant", variantSchema);
