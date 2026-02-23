const mongoose = require("mongoose");

/**
 * Asset Model - Media asset management with lifecycle tracking
 *
 * Core Principles:
 * - Single Cloudinary folder (flat storage)
 * - Database is single source of truth
 * - Hash-based deduplication
 * - Origin tracking (immutable)
 * - Usage tracking via usedBy array
 */

const AssetSchema = new mongoose.Schema(
  {
    // Cloudinary identifiers
    publicId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    secureUrl: {
      type: String,
      required: true,
    },
    assetId: {
      type: String,
      required: true,
    },

    // Deduplication - hash of file content
    hash: {
      type: String,
      required: true,
      index: true, // Fast duplicate lookup
    },

    // Metadata
    width: { type: Number },
    height: { type: Number },
    format: { type: String },
    resourceType: { type: String },
    bytes: { type: Number },

    // Lifecycle management
    status: {
      type: String,
      enum: ["temp", "permanent", "archived"],
      required: true,
      default: "temp",
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index: true, // For cleanup queries
    },
    archivedAt: {
      type: Date,
      default: null,
      index: true, // For delayed cleanup
    },

    // Origin tracking (immutable after creation - for audit)
    origin: {
      source: {
        type: String,
        enum: ["product", "cms", "category", "banner"],
        required: true,
      },
      sourceContext: {
        type: String,
        required: true,
      },
    },

    // Intended usage (can be null if unknown at upload time)
    intendedFor: {
      type: String,
      enum: ["product", "cms", "category", null],
      default: null,
    },

    // Usage tracking - which entities reference this asset
    usedBy: [
      {
        entity: {
          type: String,
          enum: ["product", "cms", "category"],
          required: true,
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        _id: false, // Disable auto _id for subdocuments
      },
    ],

    // Audit fields
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Compound indexes for efficient queries
AssetSchema.index({ status: 1, expiresAt: 1 }); // Cleanup queries
AssetSchema.index({ status: 1, "origin.source": 1 }); // Gallery filtering

// Static method to find asset by hash (for deduplication)
AssetSchema.statics.findByHash = function (hash) {
  return this.findOne({ hash });
};

// Instance method to promote to permanent
AssetSchema.methods.promoteToPermanent = async function (entity, entityId) {
  this.status = "permanent";
  this.expiresAt = null;

  // Add to usedBy if not already present
  const alreadyUsed = this.usedBy.some(
    (usage) => usage.entity === entity && usage.id.equals(entityId)
  );

  if (!alreadyUsed) {
    this.usedBy.push({ entity, id: entityId });
  }

  return this.save();
};

// Instance method to check if deletable
AssetSchema.methods.isDeletable = function () {
  return this.status === "temp" && this.usedBy.length === 0;
};

const Asset = mongoose.model("Asset", AssetSchema);

module.exports = Asset;
