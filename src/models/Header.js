// models/Header.js
const mongoose = require("mongoose");

const headerSchema = new mongoose.Schema(
  {},
  {
    collection: "headerData",
    strict: false, // Allow dynamic fields since we don't know the exact structure
    timestamps: true,
  }
);

module.exports = mongoose.model("Header", headerSchema);

