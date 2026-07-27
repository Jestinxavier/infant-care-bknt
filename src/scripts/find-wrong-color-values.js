/**
 * Find products with non-color values in color variant options or filterAttributes.
 * Run: node src/scripts/find-wrong-color-values.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected.\n");

  const products = await Product.find({}).lean();
  console.log(`Scanning ${products.length} products...\n`);

  const issues = [];

  for (const product of products) {
    // Check variantOptions color values
    if (Array.isArray(product.variantOptions)) {
      for (const opt of product.variantOptions) {
        if ((opt.code || "").toLowerCase() !== "color") continue;
        for (const val of (opt.values || [])) {
          const v = (val.value || "").toLowerCase();
          // Flag anything that looks like a dimension or size, not a color
          if (/^\d+x\d+/.test(v) || /\d+\s*x\s*\d+/.test(v)) {
            issues.push({
              sku: product.sku || product._id,
              name: product.name || product.title || "Unnamed",
              source: "variantOptions",
              value: val.value,
              label: val.label,
            });
          }
        }
      }
    }

    // Check filterAttributes.color
    const colors = product.filterAttributes?.color;
    if (Array.isArray(colors)) {
      for (const c of colors) {
        const v = (c || "").toLowerCase();
        if (/^\d+x\d+/.test(v) || /\d+\s*x\s*\d+/.test(v)) {
          issues.push({
            sku: product.sku || product._id,
            name: product.name || product.title || "Unnamed",
            source: "filterAttributes.color",
            value: c,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    console.log("No issues found.");
  } else {
    console.log(`Found ${issues.length} issue(s):\n`);
    for (const issue of issues) {
      console.log(`  SKU: ${issue.sku}`);
      console.log(`  Name: ${issue.name}`);
      console.log(`  Source: ${issue.source}`);
      console.log(`  Value: "${issue.value}"${issue.label ? ` (label: "${issue.label}")` : ""}`);
      console.log();
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
