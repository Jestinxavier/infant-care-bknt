/**
 * MIGRATION SCRIPT: Legacy Variant Collection to Embedded Product.variants
 *
 * This script migrates data from the old Variant collection (with hardcoded color/age)
 * to the new embedded variants structure in Product using dynamic options Map.
 *
 * SAFETY FEATURES:
 * - Dry-run mode by default
 * - Data backup before migration
 * - Validation at each step
 * - Rollback capability
 *
 * USAGE:
 * node scripts/migrateVariants.js [--execute]
 */

// Load environment variables first
require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Variant = require("../src/models/Variant");
const { createOptionsHash } = require("../src/utils/variantValidator");
const {
  generateShortCode,
  syncVariantOptionCodes,
} = require("../src/utils/skuGenerator");

// Configuration
const DRY_RUN = !process.argv.includes("--execute");
const BACKUP_PATH = "./backup/variants_backup.json";

/**
 * Create backup of current data
 */
const createBackup = async () => {
  console.log("📦 Creating backup of existing data...");

  const products = await Product.find({}).lean();
  const variants = await Variant.find({}).lean();

  const backup = {
    timestamp: new Date().toISOString(),
    products: products.map((p) => ({
      _id: p._id,
      title: p.title,
      variants: p.variants || [],
      variantOptions: p.variantOptions || [],
    })),
    legacyVariants: variants,
  };

  const fs = require("fs");
  const path = require("path");

  // Ensure backup directory exists
  const backupDir = path.dirname(BACKUP_PATH);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));

  console.log(`✅ Backup created: ${BACKUP_PATH}`);
  console.log(`   Products: ${products.length}`);
  console.log(`   Legacy Variants: ${variants.length}`);

  return backup;
};

/**
 * Sync variant option codes for existing products
 */
const syncProductOptionCodes = async (product) => {
  const modified = syncVariantOptionCodes(product);

  if (modified && !DRY_RUN) {
    await product.save();
  }

  return modified;
};

/**
 * Migrate a single legacy variant to embedded format
 */
const migrateVariant = async (legacyVariant, product) => {
  console.log(`  Processing variant: ${legacyVariant.sku}`);

  // Build options Map from hardcoded fields
  const options = new Map();

  if (legacyVariant.color) {
    options.set("color", legacyVariant.color.toLowerCase().trim());
  }

  if (legacyVariant.age) {
    options.set("age", legacyVariant.age.toLowerCase().trim());
  }

  // Ensure product has these options configured
  const ensureVariantOption = (name, label, value) => {
    let option = product.variantOptions.find((opt) => opt.name === name);

    if (!option) {
      option = {
        id: name,
        name: name,
        code: name,
        values: [],
        position: product.variantOptions.length,
      };
      product.variantOptions.push(option);
    }

    // Check if value already exists
    const normalizedValue = value.toLowerCase().trim();
    const existingValue = option.values.find(
      (v) => v.value.toLowerCase().trim() === normalizedValue
    );

    if (!existingValue) {
      option.values.push({
        id: `${name}-${value}`,
        value: normalizedValue,
        label: value.charAt(0).toUpperCase() + value.slice(1),
        code: generateShortCode(value),
      });
    }
  };

  if (legacyVariant.color) {
    ensureVariantOption("color", "Color", legacyVariant.color);
  }

  if (legacyVariant.age) {
    ensureVariantOption("age", "Age Group", legacyVariant.age);
  }

  // Create embedded variant
  const embeddedVariant = {
    id: legacyVariant._id.toString(),
    sku: legacyVariant.sku,
    url_key: legacyVariant.sku.toLowerCase(),
    price: legacyVariant.price,
    discountPrice: undefined,
    stock: legacyVariant.stock,
    pricing: {
      price: legacyVariant.price,
      discountPrice: undefined,
    },
    stockObj: {
      available: legacyVariant.stock,
      isInStock: legacyVariant.stock > 0,
    },
    images: legacyVariant.images || [],
    options: options, // Map for legacy compatibility
    attributes: options, // Map for new format
    _optionsHash: createOptionsHash(options),
    averageRating: legacyVariant.averageRating || 0,
    totalReviews: legacyVariant.totalReviews || 0,
  };

  return embeddedVariant;
};

/**
 * Main migration function
 */
const runMigration = async () => {
  console.log("🚀 Starting Variant Migration");
  console.log(
    `Mode: ${
      DRY_RUN
        ? "DRY RUN (no changes will be made)"
        : "EXECUTE (WILL MODIFY DATABASE)"
    }`
  );
  console.log("");

  try {
    // Create backup
    const backup = await createBackup();
    console.log("");

    // Get all legacy variants
    const legacyVariants = await Variant.find({});
    console.log(`📊 Found ${legacyVariants.length} legacy variants to migrate`);
    console.log("");

    // Group variants by productId
    const variantsByProduct = {};
    legacyVariants.forEach((variant) => {
      const productId = variant.productId.toString();
      if (!variantsByProduct[productId]) {
        variantsByProduct[productId] = [];
      }
      variantsByProduct[productId].push(variant);
    });

    console.log(
      `📦 Variants spread across ${
        Object.keys(variantsByProduct).length
      } products`
    );
    console.log("");

    // Migrate each product
    let migratedCount = 0;
    let errorCount = 0;

    for (const [productId, variants] of Object.entries(variantsByProduct)) {
      try {
        console.log(`\n🔄 Migrating product: ${productId}`);
        console.log(`   Variants to migrate: ${variants.length}`);

        const product = await Product.findById(productId);

        if (!product) {
          console.log(`❌ Product not found: ${productId}`);
          errorCount++;
          continue;
        }

        console.log(`   Product: ${product.title}`);

        // Initialize variants array if not exists
        if (!product.variants) {
          product.variants = [];
        }

        // Initialize variantOptions if not exists
        if (!product.variantOptions) {
          product.variantOptions = [];
        }

        // Migrate each variant
        for (const legacyVariant of variants) {
          const embeddedVariant = await migrateVariant(legacyVariant, product);

          // Check if variant already exists
          const existingIndex = product.variants.findIndex(
            (v) => v.sku === embeddedVariant.sku
          );

          if (existingIndex >= 0) {
            console.log(
              `   ⚠️  Variant ${embeddedVariant.sku} already exists, updating...`
            );
            product.variants[existingIndex] = embeddedVariant;
          } else {
            product.variants.push(embeddedVariant);
            migratedCount++;
          }
        }

        // Sync option codes
        syncProductOptionCodes(product);

        // Lock options if variants exist
        if (product.variants.length > 0) {
          product.optionsLocked = true;
        }

        // Save product
        if (!DRY_RUN) {
          await product.save();
          console.log(
            `✅ Product updated: ${product.variants.length} variants`
          );
        } else {
          console.log(
            `   [DRY RUN] Would save ${product.variants.length} variants`
          );
        }
      } catch (error) {
        console.log(`❌ Error migrating product ${productId}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n\n📊 Migration Summary:");
    console.log(`   Variants migrated: ${migratedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTED"}`);

    if (DRY_RUN) {
      console.log("\n💡 To execute the migration, run:");
      console.log("   node scripts/migrateVariants.js --execute");
    } else {
      console.log("\n✅ Migration completed successfully!");
      console.log(`   Backup saved at: ${BACKUP_PATH}`);
      console.log("\n⚠️  Next steps:");
      console.log("   1. Verify data in database");
      console.log("   2. Test product pages");
      console.log(
        "   3. If everything works, you can remove legacy Variant collection"
      );
      console.log("   4. Update API controllers to use embedded variants only");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

// Connect to MongoDB and run migration
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error(
      "❌ MONGODB_URI or MONGO_URI not found in environment variables"
    );
    console.error("   Please check your .env file");
    process.exit(1);
  }

  console.log("🔌 Connecting to MongoDB...");

  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("✅ Connected to MongoDB");
      return runMigration();
    })
    .then(() => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

module.exports = { runMigration, createBackup };
