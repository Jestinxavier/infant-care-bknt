const mongoose = require("mongoose");

/**
 * Optional-email opt-outs, keyed by address so guests are covered too.
 * Essential emails (OTP, order, invoice, shipping, refund) never read this.
 */
const EMAIL_CATEGORIES = ["cart_reminders"];

const emailPreferenceSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    unsubscribed: [{ type: String, enum: EMAIL_CATEGORIES }],
  },
  { timestamps: true },
);

const EmailPreference = mongoose.model("EmailPreference", emailPreferenceSchema);

module.exports = EmailPreference;
module.exports.EMAIL_CATEGORIES = EMAIL_CATEGORIES;
