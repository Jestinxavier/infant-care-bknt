/**
 * Quick script to generate url_key for all existing products that don't have one
 * This is a simpler version that only generates url_key without full migration
 *
 * Usage: node scripts/generateUrlKeysForExistingProducts.js [--dry-run|--apply]
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");
const { generateUniqueUrlKey } = require("../src/utils/slugGenerator");
const { parseMode } = require("./lib/cliMode");

const generateUrlKeys = async ({ dryRun = false } = {}) => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("❌ MONGODB_URI is missing. Check your .env file!");
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all products without url_key
    const products = await Product.find({
      $or: [
        { url_key: { $exists: false } },
        { url_key: null },
        { url_key: "" },
      ],
    });
    console.log(`📦 Found ${products.length} products without url_key`);

    if (products.length === 0) {
      console.log("✅ All products already have url_key!");
      await mongoose.connection.close();
      return;
    }

    let generated = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const checkUrlKeyExists = async (urlKey) => {
          const existing = await Product.findOne({
            url_key: urlKey,
            _id: { $ne: product._id },
          });
          return !!existing;
        };

        const urlKey = await generateUniqueUrlKey(
          product.title || product.name || `product-${product._id}`,
          checkUrlKeyExists
        );

        if (!dryRun) {
          product.url_key = urlKey;
          await product.save();
        }

        console.log(
          `  ${dryRun ? "○" : "✓"} ${dryRun ? "Would set" : "Generated"} url_key for: ${
            product.title || product.name
          } -> ${urlKey}`
        );
        generated++;
      } catch (err) {
        errors++;
        console.error(
          `❌ Error generating url_key for product ${product._id}:`,
          err.message
        );
      }
    }

    console.log("\n📊 Summary:");
    console.log(`  ${dryRun ? "○ Would generate" : "✅ Generated"}: ${generated}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`\n${dryRun ? "🔍 DRY RUN — no changes written." : "✅ URL key generation completed!"}`);

    // Close connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  } catch (err) {
    console.error("❌ URL key generation failed:", err);
    process.exit(1);
  }
};

// Run script
if (require.main === module) {
  const { dryRun } = parseMode(process.argv.slice(2), { defaultMode: "apply" });
  generateUrlKeys({ dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = generateUrlKeys;
