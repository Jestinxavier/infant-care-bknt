// models/LandingPage.js
const mongoose = require("mongoose");

const landingPageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    content: { type: [mongoose.Schema.Types.Mixed], default: [] },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      ogImage: { type: String, default: "" },
    },
  },
  {
    collection: "landingPages",
    strict: false, // Allow dynamic fields to match the widget block structure
    timestamps: true,
  }
);

landingPageSchema.index({ enabled: 1, updatedAt: -1 });

module.exports = mongoose.model("LandingPage", landingPageSchema);
