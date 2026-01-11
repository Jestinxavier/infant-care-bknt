/**
 * Migration Script: Set product_type for existing products
 *
 * Logic:
 * - Products with variants.length > 0 → CONFIGURABLE
 * - Products with variants.length === 0 → SIMPLE
 *
 * Usage:
 *   node scripts/migrate-product-types.js           # Execute migration
 *   node scripts/migrate-product-types.js --dry-run # Preview changes
 */

require("dotenv").config(); // Uses .env in backend folder (run from backend directory)
const mongoose = require("mongoose");
const Product = require("../src/features/product/product.model");
const { PRODUCT_TYPES } = Product;

const DRY_RUN = process.argv.includes("--dry-run");

const migrateProductTypes = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
    console.log(
      DRY_RUN ? "\n🔍 DRY RUN MODE - No changes will be saved\n" : ""
    );

    // Find all products without product_type set
    const products = await Product.find({
      $or: [{ product_type: { $exists: false } }, { product_type: null }],
    });

    console.log(`Found ${products.length} products to migrate.\n`);

    if (products.length === 0) {
      console.log("✅ All products already have product_type set.");
      process.exit(0);
    }

    const stats = { simple: 0, configurable: 0, errors: 0 };

    for (const product of products) {
      const hasVariants = product.variants && product.variants.length > 0;
      const newType = hasVariants
        ? PRODUCT_TYPES.CONFIGURABLE
        : PRODUCT_TYPES.SIMPLE;

      const logPrefix = DRY_RUN ? "[DRY RUN] " : "";
      console.log(
        `${logPrefix}${product.title} (${
          product.sku || "no-sku"
        }) → ${newType} ${
          hasVariants ? `(${product.variants.length} variants)` : ""
        }`
      );

      if (!DRY_RUN) {
        try {
          await Product.updateOne(
            { _id: product._id },
            { $set: { product_type: newType } }
          );
          if (newType === PRODUCT_TYPES.SIMPLE) stats.simple++;
          else stats.configurable++;
        } catch (err) {
          console.error(`  ❌ Error updating ${product._id}: ${err.message}`);
          stats.errors++;
        }
      } else {
        if (newType === PRODUCT_TYPES.SIMPLE) stats.simple++;
        else stats.configurable++;
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("Migration Summary:");
    console.log(`  SIMPLE:       ${stats.simple}`);
    console.log(`  CONFIGURABLE: ${stats.configurable}`);
    if (stats.errors > 0) console.log(`  Errors:       ${stats.errors}`);
    console.log("=".repeat(50));

    if (DRY_RUN) {
      console.log("\n⚠️  This was a dry run. No changes were saved.");
      console.log("   Run without --dry-run to apply changes.");
    } else {
      console.log("\n✅ Migration completed successfully.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

migrateProductTypes();
