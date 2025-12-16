/**
 * Migration script to update existing categories to include a 'code' field
 * derived from the category name.
 *
 * Run with: node src/scripts/migrate-category-codes.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");

async function migrateCategoryCodes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found in environment variables");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all categories
    const categories = await Category.find({});
    console.log(`📦 Found ${categories.length} categories to check`);

    let updated = 0;
    let skipped = 0;

    for (const category of categories) {
      // Check if code already exists and is valid
      if (category.code && category.code.trim().length > 0) {
        skipped++;
        continue;
      }

      // Generate code from name
      const code = category.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
        .replace(/(^-|-$)/g, ""); // Remove leading/trailing hyphens

      // Update the category
      await Category.updateOne({ _id: category._id }, { $set: { code: code } });

      console.log(`✅ Updated "${category.name}" -> code: "${code}"`);
      updated++;
    }

    console.log("\n📊 Migration Summary:");
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total:   ${categories.length}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

migrateCategoryCodes();
