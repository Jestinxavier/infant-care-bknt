/**
 * Migration script to:
 * 1. Rename specific category slugs to cleaner names
 * 2. Update child category slugs to include parent slug prefix
 *
 * Example: /category/cap-mittens-bootties → /category/mittens-bootties/cap-mittens-bootties
 *
 * Run with: node src/scripts/migrate-category-parent-slugs.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("../models/Category");

// Step 1: Slug renames for parent categories
const SLUG_RENAMES = {
  "/category/jabala-button": "/category/jabala",
  "/category/onesie-body-suit": "/category/onesie",
  "/category/rompers": "/category/romper",
};

// Also update codes to match new slugs
const CODE_RENAMES = {
  "jabala-button": "jabala",
  "onesie-body-suit": "onesie",
  rompers: "romper",
};

async function migrateCategoryParentSlugs() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found in environment variables");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // ─── Step 1: Rename specific slugs & codes ───────────────────────
    console.log("═══ Step 1: Renaming specific slugs & codes ═══\n");

    for (const [oldSlug, newSlug] of Object.entries(SLUG_RENAMES)) {
      const category = await Category.findOne({ slug: oldSlug });
      if (!category) {
        console.log(`⏭️  Skipping rename: "${oldSlug}" not found`);
        continue;
      }

      // Determine new code from slug
      const newCode = newSlug.replace("/category/", "");
      const oldCode = category.code;

      await Category.updateOne(
        { _id: category._id },
        { $set: { slug: newSlug, code: newCode } }
      );

      console.log(`✅ Renamed slug: "${oldSlug}" → "${newSlug}"`);
      if (oldCode !== newCode) {
        console.log(`   Code: "${oldCode}" → "${newCode}"`);
      }
    }

    console.log("");

    // ─── Step 2: Update child slugs with parent prefix ───────────────
    console.log("═══ Step 2: Updating child category slugs ═══\n");

    // Re-fetch all categories after renames
    const allCategories = await Category.find({}).lean();

    // Build a lookup map by _id
    const categoryMap = new Map();
    allCategories.forEach((cat) => categoryMap.set(cat._id.toString(), cat));

    let updated = 0;
    let skipped = 0;

    for (const category of allCategories) {
      // Skip if no parent (it's a root category)
      if (!category.parentCategory) {
        skipped++;
        continue;
      }

      const parent = categoryMap.get(category.parentCategory.toString());
      if (!parent) {
        console.log(
          `⚠️  Parent not found for "${category.name}" (parentId: ${category.parentCategory})`
        );
        skipped++;
        continue;
      }

      // Extract parent code from parent slug: "/category/mittens-bootties" → "mittens-bootties"
      const parentCode = parent.slug.replace("/category/", "");
      const childCode = category.code;

      // New slug: /category/{parentCode}/{childCode}
      const newSlug = `/category/${parentCode}/${childCode}`;

      // Skip if already correct
      if (category.slug === newSlug) {
        console.log(
          `⏭️  "${category.name}" already has correct slug: ${category.slug}`
        );
        skipped++;
        continue;
      }

      await Category.updateOne(
        { _id: category._id },
        { $set: { slug: newSlug } }
      );

      console.log(
        `✅ Updated "${category.name}": ${category.slug} → ${newSlug}`
      );
      updated++;
    }

    console.log("\n📊 Migration Summary:");
    console.log(`   Slug renames: ${Object.keys(SLUG_RENAMES).length}`);
    console.log(`   Child slugs updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total categories: ${allCategories.length}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

migrateCategoryParentSlugs();
