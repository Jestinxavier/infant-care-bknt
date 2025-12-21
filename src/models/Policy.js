// models/Policy.js
const mongoose = require("mongoose");

const policySchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
  },
  {
    collection: "policy",
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("Policy", policySchema);
