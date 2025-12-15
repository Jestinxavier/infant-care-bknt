/**
 * Sync Variant Option Codes for Existing Products
 * Adds missing 'code' fields to existing variantOptions
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");

const crypto = require("crypto");

const generateShortCode = (value) => {
  if (!value || typeof value !== "string") return "UNK";

  const normalized = value.toUpperCase().trim();

  const patterns = {
    RED: "RD",
    BLUE: "BL",
    GREEN: "GR",
    BLACK: "BLK",
    WHITE: "WHT",
    YELLOW: "YL",
    ORANGE: "OR",
    PURPLE: "PR",
    PINK: "PK",
    BROWN: "BR",
    GRAY: "GRY",
    GREY: "GRY",
    SMALL: "S",
    MEDIUM: "M",
    LARGE: "L",
    "EXTRA LARGE": "XL",
    "EXTRA SMALL": "XS",
    XXL: "XXL",
    XXXL: "XXXL",
    "0-3 MONTHS": "03M",
    "3-6 MONTHS": "36M",
    "6-9 MONTHS": "69M",
    "0-3M": "03M",
    "3-6M": "36M",
    "6-9M": "69M",
    "0-3": "03M",
    "3-6": "36M",
    "6-9": "69M",
    COTTON: "COT",
    POLYESTER: "PLY",
    WOOL: "WOL",
  };

  if (patterns[normalized]) return patterns[normalized];

  const ascii = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const consonants = ascii.replace(/[AEIOU\s\-]/g, "");
  let code = consonants.substring(0, 3);

  if (code.length < 2) {
    code = ascii.substring(0, 3);
  }

  const hash = crypto.createHash("md5").update(normalized).digest("hex")[0];
  return (code + hash).toUpperCase();
};

const syncCodes = async () => {
  console.log("🔄 Syncing variant option codes...\n");

  const products = await Product.find({
    variantOptions: { $exists: true, $ne: [] },
  });

  console.log(`Found ${products.length} products with variant options\n`);

  let updatedCount = 0;
  let codesAdded = 0;

  for (const product of products) {
    let modified = false;

    product.variantOptions.forEach((option) => {
      if (option.values && Array.isArray(option.values)) {
        option.values.forEach((valueObj) => {
          if (!valueObj.code && valueObj.value) {
            valueObj.code = generateShortCode(valueObj.value);
            codesAdded++;
            modified = true;
          }
        });
      }
    });

    if (modified) {
      await product.save();
      updatedCount++;
      console.log(
        `✅ Updated: ${product.title} (${product.variantOptions.length} options)`
      );
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Products updated: ${updatedCount}`);
  console.log(`   Codes added: ${codesAdded}`);
};

// Run
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error("❌ MONGODB_URI not found");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("✅ Connected to MongoDB\n");
    return syncCodes();
  })
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
