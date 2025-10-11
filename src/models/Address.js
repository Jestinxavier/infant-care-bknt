// models/Address.js
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  name: String,
  phone: String,
  addressLine1: String,
  addressLine2: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  isDefault: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Optional: prevent duplicate addresses for same user
addressSchema.index({
  userId: 1,
  addressLine1: 1,
  city: 1,
  postalCode: 1
}, { unique: false });

module.exports = mongoose.model("Address", addressSchema);
