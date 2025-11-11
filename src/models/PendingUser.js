const mongoose = require("mongoose");

/**
 * Temporary storage for OTP verification
 * Only stores email and OTP, no user data yet
 */
const pendingUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    otp: {
      type: String,
      required: true
    },
    otpExpires: {
      type: Date,
      required: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    isLoginOTP: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Auto-delete expired OTP records after 15 minutes
pendingUserSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 900 });

module.exports = mongoose.model("PendingUser", pendingUserSchema);
