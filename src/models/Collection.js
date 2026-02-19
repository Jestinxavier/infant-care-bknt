const mongoose = require("mongoose");
const HEX_BADGE_COLOR_REGEX = /^#[0-9A-F]{6}$/;

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    badgeLabel: { type: String, trim: true, default: null },
    badgeColor: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      validate: {
        validator: (value) =>
          value === null || value === undefined || HEX_BADGE_COLOR_REGEX.test(value),
        message: "badgeColor must be a valid hex code in #RRGGBB format",
      },
    },
    badgeLabelColor: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      validate: {
        validator: (value) =>
          value === null || value === undefined || HEX_BADGE_COLOR_REGEX.test(value),
        message: "badgeLabelColor must be a valid hex code in #RRGGBB format",
      },
    },
  },
  {
    timestamps: true,
    collection: "collections",
  }
);

collectionSchema.index({ name: 1 });

if (mongoose.connection.models.Collection) {
  delete mongoose.connection.models.Collection;
}
if (mongoose.models.Collection) {
  delete mongoose.models.Collection;
}

module.exports = mongoose.model("Collection", collectionSchema);
