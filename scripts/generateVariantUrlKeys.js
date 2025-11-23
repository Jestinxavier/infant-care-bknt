/**
 * Script to generate url_key for all existing variants that don't have one
 * This ensures all variants have explicit url_key stored in the database
 *
 * Usage: node src/scripts/generateVariantUrlKeys.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");
const { generateSlug } = require("../src/utils/slugGenerator");

const generateVariantUrlKeys = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error(
        "❌ MONGODB_URI or MONGO_URI is missing. Check your .env file!"
      );
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all products with variants
    const products = await Product.find({
      variants: { $exists: true, $ne: [] },
    });
    console.log(`📦 Found ${products.length} products with variants`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const product of products) {
      try {
        if (!product.url_key) {
          console.log(
            `⏭️  Skipping product ${product._id} - no parent url_key`
          );
          skipped++;
          continue;
        }

        let needsUpdate = false;
        const updatedVariants = product.variants.map((variant) => {
          // If variant already has url_key, keep it
          if (variant.url_key) {
            return variant;
          }

          // Generate url_key from attributes
          const attrs = variant.attributes
            ? variant.attributes instanceof Map
              ? Object.fromEntries(variant.attributes)
              : variant.attributes
            : variant.options instanceof Map
            ? Object.fromEntries(variant.options)
            : variant.options || {};

          const parts = [product.url_key];
          if (attrs.color) parts.push(generateSlug(attrs.color));
          if (attrs.size || attrs.age) {
            parts.push(generateSlug(attrs.size || attrs.age));
          }

          const variantUrlKey = parts.join("-");
          needsUpdate = true;

          return {
            ...(variant.toObject ? variant.toObject() : variant),
            url_key: variantUrlKey,
          };
        });

        if (needsUpdate) {
          product.variants = updatedVariants;
          await product.save();
          console.log(
            `  ✓ Generated url_key for ${
              updatedVariants.filter(
                (v) =>
                  v.url_key &&
                  !product.variants.find((ov) => ov.id === v.id && ov.url_key)
              ).length
            } variants in: ${product.title || product.name}`
          );
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(
          `❌ Error processing product ${product._id}:`,
          err.message
        );
      }
    }

    console.log("\n📊 Summary:");
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log("\n✅ Variant URL key generation completed!");

    // Close connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  } catch (err) {
    console.error("❌ Variant URL key generation failed:", err);
    process.exit(1);
  }
};

// Run script
if (require.main === module) {
  generateVariantUrlKeys()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = generateVariantUrlKeys;
