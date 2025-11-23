/**
 * Seed Script: Create infant clothing products
 *
 * This script creates sample infant clothing products with the new structure
 *
 * Usage: node src/scripts/seedInfantClothingProducts.js
 */
const isDryRun = process.argv.includes("--dry");
const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const { generateUniqueUrlKey } = require("../src/utils/slugGenerator");
const { PRODUCTS } = require("../resources/constants");
const { generateVariantTitle } = require("../src/utils/generateVariantTitle");

const seedProducts = async () => {
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

    // Clear existing products (optional - comment out if you want to keep existing)
    // await Product.deleteMany({});
    // console.log("🗑️  Cleared existing products");

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const products = isDryRun ? PRODUCTS.slice(0, 1) : PRODUCTS;

    for (const productData of products) {
      try {
        // Check if product already exists
        const existing = await Product.findOne({
          url_key: productData.url_key,
        });
        if (existing) {
          console.log(`⏭️  Skipped (already exists): ${productData.title}`);
          skipped++;
          continue;
        }

        // Find or create category
        let category = await Category.findOne({
          slug: productData.categorySlug,
        });
        if (!category) {
          // Create category if it doesn't exist
          category = await Category.create({
            name: productData.categorySlug
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
            slug: productData.categorySlug,
            isActive: true,
            displayOrder: 1,
          });
          console.log(`  ✓ Created category: ${category.name}`);
        }

        // Generate url_key if not provided
        if (!productData.url_key) {
          const checkUrlKeyExists = async (urlKey) => {
            const existing = await Product.findOne({ url_key: urlKey });
            return !!existing;
          };
          productData.url_key = await generateUniqueUrlKey(
            productData.title,
            checkUrlKeyExists
          );
        }

        // Use pricing and stock from productData (already calculated in the data structure)
        const parentPricing = productData.pricing || null;
        const parentStock = productData.stock || null;

        // Generate variant url_keys and ensure stock format
        const { generateSlug } = require("../src/utils/slugGenerator");
        const processedVariants = (productData?.variants || []).map((v) => {
          const attrs =
            v.attributes instanceof Map
              ? Object.fromEntries(v.attributes)
              : v.attributes ?? {};

          // Convert attributes to sorted key-value pairs
          // Sorting ensures predictable URL order even when DB order changes
          const entries = Object.entries(attrs)
            .filter(([_, val]) => val) // remove empty/null values
            .sort(([a], [b]) => a.localeCompare(b));

          const slugify = (val) => generateSlug(String(val));

          const urlParts = [
            productData?.url_key,
            ...entries.map(([, val]) => slugify(val)),
          ];

          const variantUrlKey = urlParts.length > 1 ? urlParts.join("-") : null;

          // Ensure stock is in the correct format (use stockObj for DB)
          const variantStock = v?.stock || v?.stockObj || null;
          const variantTitle = generateVariantTitle(
            productData?.title,
            attrs,
            productData?.variantOptions
          );

          // Create variant object, removing stock if it's an object (use stockObj instead)
          const variant = {
            ...v,
            title: variantTitle,
            url_key: variantUrlKey,
            stockObj: variantStock, // Use stockObj for DB schema
          };

          // Remove stock if it's an object (to avoid validation error)
          if (variant?.stock && typeof variant?.stock === "object") {
            delete variant.stock;
          }

          return variant;
        });

        // Create product
        // Build final product payload
        const productPayload = {
          title: productData?.title,
          name: productData?.title, // Sync for backward compatibility
          description: productData?.description,
          category: category._id, // Use ObjectId, not object
          categoryName: category.name, // Store category name separately
          url_key: productData.url_key,
          pricing: parentPricing,
          stockObj: parentStock, // Use stockObj for DB schema
          images: productData?.images || [],
          variantOptions: productData?.variantOptions,
          variants: processedVariants,
          details: productData?.details,
          status: productData?.status || "published",
        };

        // If dry-run, DO NOT save — only log
        if (isDryRun) {
          console.log(`\n🔍 DRY RUN — Product Preview (${productData?.title})`);
          console.log(JSON.stringify(productPayload, null, 2));
          created++;
          continue; // Skip DB insert
        }

        // If NOT dry-run → push to DB
        const product = await Product.create(productPayload);

        console.log(
          `✅ Created product: ${product.title} (${product.variants.length} variants)`
        );
        created++;
      } catch (err) {
        errors++;
        console.error(
          `❌ Error creating product ${productData.title}:`,
          err.message
        );
        console.error("Full error:", err);
        // Exit on error - stop the script
        console.error(
          "\n❌ Script stopped due to error. Fix the issue and try again."
        );
        await mongoose.connection.close();
        process.exit(1);
      }
    }

    console.log("\n📊 Seeding Summary:");
    console.log(`  ✅ Created: ${created}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log("\n✅ Seeding completed!");

    // Close connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
};

// Run seeding
if (require.main === module) {
  seedProducts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = seedProducts;
