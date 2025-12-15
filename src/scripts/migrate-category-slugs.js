/**
 * Migration script to update existing category slugs to include /category/ prefix
 *
 * Run with: node src/scripts/migrate-category-slugs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");

async function migrateCategorySlugs() {
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
    console.log(`📦 Found ${categories.length} categories to update`);

    let updated = 0;
    let skipped = 0;

    for (const category of categories) {
      // Skip if already has /category/ prefix
      if (category.slug && category.slug.startsWith("/category/")) {
        console.log(
          `⏭️  Skipping "${category.name}" - already has prefix: ${category.slug}`
        );
        skipped++;
        continue;
      }

      // Generate new slug with prefix
      const baseSlug =
        category.slug ||
        category.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      const newSlug = `/category/${baseSlug.replace(/^\/category\//, "")}`;

      // Update directly in database to bypass pre-save hook
      await Category.updateOne(
        { _id: category._id },
        { $set: { slug: newSlug } }
      );

      console.log(
        `✅ Updated "${category.name}": ${
          category.slug || "(empty)"
        } → ${newSlug}`
      );
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
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

migrateCategorySlugs();
