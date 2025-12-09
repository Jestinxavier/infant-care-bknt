// models/About.js
const mongoose = require("mongoose");

const aboutSchema = new mongoose.Schema(
  {},
  {
    collection: "about",
    strict: false, // Allow dynamic fields since we don't know the exact structure
    timestamps: true,
  }
);

module.exports = mongoose.model("About", aboutSchema);

