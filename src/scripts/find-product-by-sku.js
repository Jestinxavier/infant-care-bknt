/**
 * Find product by SKU and show full details.
 * Run: node src/scripts/find-product-by-sku.js TOWE-FCTW-30DBFC
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");

async function main() {
  const sku = process.argv[2];
  if (!sku) {
    console.log("Usage: node src/scripts/find-product-by-sku.js <SKU>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected.\n");

  const product = await Product.findOne({ sku }).lean();
  if (!product) {
    console.log(`No product found with SKU: ${sku}`);
    process.exit(0);
  }

  console.log("=== Product Found ===");
  console.log(`  _id:          ${product._id}`);
  console.log(`  SKU:          ${product.sku}`);
  console.log(`  Name:         ${product.name || product.title}`);
  console.log(`  Status:       ${product.status}`);
  console.log(`  Product Type: ${product.product_type}`);
  console.log(`  Category:     ${JSON.stringify(product.category)}`);
  console.log();

  console.log("=== filterAttributes ===");
  for (const [key, values] of Object.entries(product.filterAttributes || {})) {
    console.log(`  ${key}: ${JSON.stringify(values)}`);
  }
  console.log();

  if (Array.isArray(product.variantOptions) && product.variantOptions.length > 0) {
    console.log("=== variantOptions ===");
    for (const opt of product.variantOptions) {
      console.log(`  ${opt.code} (${opt.name || ""}):`);
      for (const val of (opt.values || [])) {
        console.log(`    - value: "${val.value}"  label: "${val.label}"  hex: ${val.hex || "none"}`);
      }
    }
    console.log();
  }

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    console.log(`=== variants (${product.variants.length}) ===`);
    for (const variant of product.variants.slice(0, 10)) {
      const attrs = variant.attributes || variant.options || {};
      const entries = attrs instanceof Map ? [...attrs.entries()] : Object.entries(attrs);
      console.log(`  SKU: ${variant.sku || "—"}  Price: ${variant.price || "—"}`);
      for (const [k, v] of entries) {
        console.log(`    ${k}: "${v}"`);
      }
    }
    if (product.variants.length > 10) {
      console.log(`  ... and ${product.variants.length - 10} more`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
