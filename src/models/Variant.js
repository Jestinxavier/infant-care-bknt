// models/Variant.js
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  color: { type: String, required: true },
  size: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  sku: { type: String, unique: true },
  images: [{ type: String }] // URLs
}, { timestamps: true });

module.exports = mongoose.model("Variant", variantSchema);
