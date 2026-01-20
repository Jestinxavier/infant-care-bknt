/**
 * Migration Script: Migrate from product-scoped attributes to global attribute registry
 *
 * This script:
 * 1. Collects all unique attribute codes from existing products
 * 2. Creates global AttributeDefinition documents (with normalization)
 * 3. Updates product variantOptions to reference attributeId
 * 4. Updates usageCount for each attribute
 *
 * Usage:
 *   node backend/scripts/migrateToGlobalAttributes.js [--dry-run]
 *
 * Flags:
 *   --dry-run    Preview changes without saving to database
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Product = require("../src/models/Product");
const AttributeDefinition = require("../src/models/AttributeDefinition");
const { normalizeCode, toTitleCase } = require("../src/utils/normalizeValue");

// Configuration
const DRY_RUN = process.argv.includes("--dry-run");

async function connectDB() {
  const mongoUri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/infant_care";
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB: ${mongoUri.substring(0, 50)}...`);
}

async function disconnectDB() {
  await mongoose.disconnect();
  console.log("✅ Disconnected from MongoDB");
}

async function migrate() {
  console.log("\n🚀 Starting Global Attributes Migration");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes saved)" : "LIVE"}\n`);

  // Step 1: Find all products with variantOptions
  const products = await Product.find({
    "variantOptions.0": { $exists: true },
  }).lean();

  console.log(`📦 Found ${products.length} products with variant options\n`);

  if (products.length === 0) {
    console.log("No products to migrate.");
    return;
  }

  // Step 2: Collect unique attributes (normalized)
  const uniqueAttrs = new Map();
  const usageCounts = new Map();

  for (const product of products) {
    for (const opt of product.variantOptions || []) {
      const rawCode = opt.code || opt.name || "";
      const normalizedCode = normalizeCode(rawCode);

      if (!normalizedCode) continue;

      // Track first occurrence for label
      if (!uniqueAttrs.has(normalizedCode)) {
        uniqueAttrs.set(normalizedCode, {
          code: normalizedCode,
          label: toTitleCase(opt.name || normalizedCode),
          type: "enum",
          uiType: normalizedCode.includes("color") ? "swatch" : "dropdown",
        });
      }

      // Track usage count per product (not per option)
      const productAttrKey = `${product._id.toString()}_${normalizedCode}`;
      if (!usageCounts.has(productAttrKey)) {
        usageCounts.set(productAttrKey, normalizedCode);
      }
    }
  }

  // Calculate actual usage counts
  const attrUsageCounts = new Map();
  for (const code of usageCounts.values()) {
    attrUsageCounts.set(code, (attrUsageCounts.get(code) || 0) + 1);
  }

  console.log(`🏷️  Found ${uniqueAttrs.size} unique attributes:`);
  for (const [code, attr] of uniqueAttrs) {
    const count = attrUsageCounts.get(code) || 0;
    console.log(`   - ${code} (${attr.label}) - used by ${count} products`);
  }
  console.log("");

  // Step 3: Create global attributes
  const codeToIdMap = new Map();

  for (const [code, attrData] of uniqueAttrs) {
    const usageCount = attrUsageCounts.get(code) || 0;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would create attribute: ${code}`);
      codeToIdMap.set(code, new mongoose.Types.ObjectId()); // Fake ID for dry run
    } else {
      try {
        const result = await AttributeDefinition.findOneAndUpdate(
          { code },
          {
            $setOnInsert: {
              ...attrData,
              usageCount,
              isLocked: usageCount > 0,
            },
          },
          { upsert: true, new: true },
        );
        codeToIdMap.set(code, result._id);
        console.log(
          `✅ Created/Updated attribute: ${code} (ID: ${result._id})`,
        );
      } catch (error) {
        console.error(`❌ Error creating attribute ${code}:`, error.message);
      }
    }
  }

  console.log("");

  // Step 4: Update products to use attributeId
  let updatedCount = 0;

  for (const product of products) {
    const newVariantOptions = (product.variantOptions || []).map((opt, idx) => {
      const rawCode = opt.code || opt.name || "";
      const normalizedCode = normalizeCode(rawCode);
      const attributeId = codeToIdMap.get(normalizedCode);

      return {
        attributeId,
        position: opt.position ?? idx,
        values: opt.values || [],
        // Keep legacy fields during transition
        id: opt.id,
        name: opt.name,
        code: opt.code,
      };
    });

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] Would update product: ${product.title} (${product._id})`,
      );
    } else {
      try {
        await Product.updateOne(
          { _id: product._id },
          { $set: { variantOptions: newVariantOptions } },
        );
        console.log(`✅ Updated product: ${product.title}`);
        updatedCount++;
      } catch (error) {
        console.error(
          `❌ Error updating product ${product.title}:`,
          error.message,
        );
      }
    }
  }

  console.log("");
  console.log("=".repeat(50));
  console.log("📊 Migration Summary");
  console.log("=".repeat(50));
  console.log(`Attributes created: ${uniqueAttrs.size}`);
  console.log(
    `Products updated: ${DRY_RUN ? products.length + " (dry run)" : updatedCount}`,
  );
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "COMPLETE"}`);

  if (DRY_RUN) {
    console.log("\n⚠️  This was a dry run. No changes were saved.");
    console.log("   Run without --dry-run to apply changes.");
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await migrate();
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
