// models/Policy.js
const mongoose = require("mongoose");

const policySchema = new mongoose.Schema(
  {},
  {
    collection: "policy",
    strict: false, // Allow dynamic fields since we don't know the exact structure
    timestamps: true,
  }
);

module.exports = mongoose.model("Policy", policySchema);

