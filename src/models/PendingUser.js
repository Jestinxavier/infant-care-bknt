const mongoose = require("mongoose");

/**
 * Temporary storage for users pending email verification
 * These are deleted after successful verification or expiry
 */
const pendingUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    otp: {
      type: String,
      required: true
    },
    otpExpires: {
      type: Date,
      required: true,
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// Auto-delete expired pending users after 15 minutes
pendingUserSchema.index({ otpExpires: 1 }, { expireAfterSeconds: 900 });

module.exports = mongoose.model("PendingUser", pendingUserSchema);
