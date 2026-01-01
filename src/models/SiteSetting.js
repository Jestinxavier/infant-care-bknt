const mongoose = require("mongoose");

const siteSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      immutable: true,
      // Examples: "contact.phone", "cart.shipping.flat", "seo.meta.title"
    },
    value: {
      type: mongoose.Schema.Types.Mixed, // Flexible: string, number, boolean, object
      required: true,
    },
    type: {
      type: String,
      enum: ["string", "number", "boolean", "json"],
      required: true,
    },
    scope: {
      type: String,
      enum: ["global", "page", "cart", "contact", "seo", "order", "product"],
      default: "global",
      index: true,
    },
    description: {
      type: String, // Helper text for admin UI
    },
    isPublic: {
      type: Boolean,
      default: true, // false for admin-only settings
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SiteSetting", siteSettingSchema);
