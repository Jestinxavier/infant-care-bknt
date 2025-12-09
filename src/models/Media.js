// models/Media.js
const mongoose = require("mongoose");

/**
 * Media Model
 * Tracks uploaded images with metadata and temporary status
 * Used for proper lifecycle management of Cloudinary assets
 */
const mediaSchema = new mongoose.Schema(
  {
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
    resource_type: { type: String, default: "image" },

    // Lifecycle tracking
    isTemp: {
      type: Boolean,
      default: true,
      index: true, // Index for efficient queries
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
      index: true, // Index for cron cleanup queries
    },
    finalizedAt: {
      type: Date,
      default: null,
    },

    // Reference tracking (optional - for debugging/audit)
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Context (optional - helps identify where image is used)
    context: {
      type: String,
      enum: ["product", "variant", "cms", "other"],
      default: "other",
    },

    // Alt text for accessibility
    alt: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index for efficient cleanup queries
mediaSchema.index({ isTemp: 1, uploadedAt: 1 });

// Index for finding temp images by public_id
mediaSchema.index({ public_id: 1, isTemp: 1 });

module.exports = mongoose.model("Media", mediaSchema);
