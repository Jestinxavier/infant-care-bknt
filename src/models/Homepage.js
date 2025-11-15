// models/Homepage.js
const mongoose = require("mongoose");

const homepageSchema = new mongoose.Schema(
  {},
  {
    collection: "homepage",
    strict: false, // Allow dynamic fields since we don't know the exact structure
    timestamps: true,
  }
);

module.exports = mongoose.model("Homepage", homepageSchema);

