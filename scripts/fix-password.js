/**
 * Script to fix password hashing issues
 * Usage: node scripts/fix-password.js <email> <newPassword>
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/user");
require("dotenv").config();

async function fixPassword(email, newPassword) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/infant_care");
    console.log("✅ Connected to MongoDB");

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.error("❌ User not found:", email);
      process.exit(1);
    }

    console.log("📋 Current user:", {
      email: user.email,
      username: user.username,
      passwordHash: user.password.substring(0, 30) + "...",
      isHashed: user.password.startsWith("$2"),
    });

    // Test current password
    if (newPassword) {
      const currentMatch = await bcrypt.compare(newPassword, user.password);
      console.log("🔐 Current password matches:", currentMatch);
    }

    // Set new password (will be hashed by pre-save hook)
    if (newPassword) {
      user.password = newPassword;
      await user.save();
      console.log("✅ Password updated successfully");
      
      // Verify new password
      const newMatch = await user.comparePassword(newPassword);
      console.log("🔐 New password verification:", newMatch);
    }

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email) {
  console.error("Usage: node scripts/fix-password.js <email> [newPassword]");
  process.exit(1);
}

fixPassword(email, password);

