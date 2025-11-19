// models/Product.js
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Category", 
    required: true,
    index: true
  },
  // Keep legacy category string for backward compatibility during migration
  categoryName: { type: String },
  tags: [String],
  basePrice: Number,
  // Rating fields (aggregated from all variants)
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
