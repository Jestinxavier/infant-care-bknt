// models/Address.js
const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  name: String,
  nickname: {
    type: String,
    default: "Home"
  },
  fullName: String,
  phone: String,
  houseName: String,
  street: String,
  landmark: String,
  addressLine1: String, // Keep for backward compatibility
  addressLine2: String, // Keep for backward compatibility
  city: String,
  state: String,
  district: String,
  postalCode: String,
  pincode: String, // Keep for backward compatibility
  country: {
    type: String,
    default: "India"
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Optional: prevent duplicate addresses for same user
addressSchema.index({
  userId: 1,
  street: 1,
  city: 1,
  postalCode: 1
}, { unique: false });

module.exports = mongoose.model("Address", addressSchema);
