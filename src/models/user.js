const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, "Invalid email format"],
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    // Email Verification Fields (OTP-based)
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailOTP: {
      type: String,
      default: null,
    },
    emailOTPExpires: {
      type: Date,
      default: null,
    },
    // Password Reset Fields
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Only hash if password is modified
  if (!this.isModified("password")) return next();
  
  // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 chars)
  if (this.password && this.password.match(/^\$2[ayb]\$.{56}$/)) {
    console.warn("⚠️  Password appears to already be hashed, skipping hash to prevent double-hashing");
    return next();
  }
  
  // Hash the password
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (password) {
  if (!password || !this.password) {
    console.error("❌ Password comparison failed: Missing password or stored password");
    return false;
  }

  const isHashed = this.password.startsWith("$2");

  if (isHashed) {
    try {
      const result = await bcrypt.compare(password, this.password);
      if (!result) {
        console.error("❌ Password comparison failed: bcrypt.compare returned false");
        console.error("   Stored hash:", this.password.substring(0, 20) + "...");
      }
      return result;
    } catch (error) {
      console.error("❌ Error comparing password with bcrypt:", error);
      return false;
    }
  } else {
    // Legacy plain-text password
    console.warn("⚠️  Plain-text password detected, upgrading to hash");
    if (this.password === password) {
      // Upgrade: hash and save
      this.password = await bcrypt.hash(password, 10);
      await this.save();
      return true;
    }
    console.error("❌ Password comparison failed: Plain-text password mismatch");
    return false;
  }
};

module.exports = mongoose.model("User", userSchema);
