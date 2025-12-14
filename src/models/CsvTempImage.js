// models/CsvTempImage.js
const mongoose = require("mongoose");

/**
 * CSV Temp Image Model
 * Tracks temporarily uploaded images for CSV import
 * These images are stored in a separate Cloudinary folder
 * and cleaned up after 24 hours if not used
 */
const csvTempImageSchema = new mongoose.Schema(
  {
    // Unique temporary key (e.g., "csv_temp_img_12345")
    temp_key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Cloudinary identifiers
    public_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },

    // Image metadata
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    format: { type: String, default: "jpg" },
    size: { type: Number, default: 0 }, // bytes

    // Lifecycle tracking
    uploadedAt: {
      type: Date,
      default: Date.now,
      index: true, // Index for cron cleanup queries
    },

    // User who uploaded
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Original filename for reference
    originalName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound index for efficient cleanup queries
csvTempImageSchema.index({ uploadedAt: 1 });

// Static method to generate temp key
csvTempImageSchema.statics.generateTempKey = function () {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `csv_temp_img_${timestamp}_${random}`;
};

module.exports = mongoose.model("CsvTempImage", csvTempImageSchema);
