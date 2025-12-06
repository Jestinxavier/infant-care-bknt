// models/Footer.js
const mongoose = require("mongoose");

const footerSchema = new mongoose.Schema(
  {},
  {
    collection: "footerData",
    strict: false, // Allow dynamic fields since we don't know the exact structure
    timestamps: true,
  }
);

module.exports = mongoose.model("Footer", footerSchema);

