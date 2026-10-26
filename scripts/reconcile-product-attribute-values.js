/**
 * Reconciliation migration — canonicalize every existing product's attribute
 * values against the AttributeDefinition catalogue, so LATER merges are
 * unnecessary (products already hold the canonical value).
 *
 * For each product it rewrites, using the shared resolver:
 *   - variantOptions[].values[].value/label  → canonical value + label
 *   - variants[].attributes/options[code]    → canonical value
 *   - filterAttributes.<key>[]               → canonical value
 *
 * DRY RUN BY DEFAULT. Prints, per attribute value, how many products would be
 * rewritten ("0-3" → "0-3m") and lists values that cannot be resolved (those
 * need a human decision in Settings → Product Attributes first).
 *
 * Usage:
 *   node scripts/reconcile-product-attribute-values.js                # dry run
 *   node scripts/reconcile-product-attribute-values.js --write        # apply
 *   node scripts/reconcile-product-attribute-values.js --attribute size
 *   node scripts/reconcile-product-attribute-values.js --limit 200
 *   node scripts/reconcile-product-attribute-values.js --uri <url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Product = require("../src/models/Product");
const { loadAttributeCatalogMap } = require("../src/utils/attributeCatalogGuard");
const { canonicalizeProductAttributeValues } = require("../src/utils/productAttributeCanonicalizer");

const flagIndex = (name) => process.argv.indexOf(name);
const flagValue = (name) => {
  const i = flagIndex(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const WRITE = process.argv.includes("--write");
const MONGO_URI_OVERRIDE = flagValue("--uri");
const ATTRIBUTE_FILTER = flagValue("--attribute");
const LIMIT = flagValue("--limit") ? parseInt(flagValue("--limit"), 10) : 0;

async function main() {
  const mongoUri =
    MONGO_URI_OVERRIDE || process.env.MONGODB_URI || "mongodb://localhost:27017";

  console.log(
    `\n${WRITE ? "✍️  Reconciling attribute values (WRITE mode)" : "🔎 Reconciling attribute values (dry run — pass --write to apply)"}`,
  );
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^@]*@/, "//***@")}\n`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const catalogMap = await loadAttributeCatalogMap();
  console.log(`Loaded ${catalogMap.size} attribute keys from the catalogue.`);
  if (ATTRIBUTE_FILTER) console.log(`Filtering to attribute: ${ATTRIBUTE_FILTER}`);
  if (LIMIT) console.log(`Limiting to ${LIMIT} products.`);

  const cursor = Product.find({}).cursor();

  const rewriteCounts = new Map(); // "scope|key|from|to" -> count
  const unresolvedCounts = new Map(); // "scope|key|value" -> count
  let scanned = 0;
  let touched = 0;
  let failed = 0;

  for await (const product of cursor) {
    scanned += 1;
    if (LIMIT && scanned > LIMIT) break;

    const { changed, rewrites, unresolved } = canonicalizeProductAttributeValues(
      product,
      catalogMap,
    );

    const relevant = [
      ...rewrites.map((r) => ({ kind: "rewrite", ...r })),
      ...unresolved.map((u) => ({ kind: "unresolved", ...u })),
    ].filter((r) => !ATTRIBUTE_FILTER || r.key === ATTRIBUTE_FILTER.toLowerCase());

    for (const r of relevant) {
      const map = r.kind === "rewrite" ? rewriteCounts : unresolvedCounts;
      const k =
        r.kind === "rewrite"
          ? `${r.scope}|${r.key}|${r.from}|${r.to}`
          : `${r.scope}|${r.key}|${r.value}`;
      map.set(k, (map.get(k) || 0) + 1);
    }

    const touchedByFilter = relevant.some((r) => r.kind === "rewrite");
    if (changed && touchedByFilter) {
      touched += 1;
      if (WRITE) {
        try {
          product.markModified("variantOptions");
          product.markModified("variants");
          product.markModified("filterAttributes");
          await product.save();
        } catch (error) {
          failed += 1;
          console.error(`  ✗ ${product._id}: ${error.message}`);
        }
      }
    }
  }

  // ---- Report ----
  console.log(`\n${"=".repeat(72)}`);
  if (rewriteCounts.size) {
    console.log("Rewrites (value → canonical):");
    const rows = [...rewriteCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, count] of rows) {
      const [scope, key, from, to] = k.split("|");
      console.log(`  ${String(count).padStart(6)} × ${scope}.${key}: "${from}" → "${to}"`);
    }
  } else {
    console.log("Rewrites: none — every product already holds canonical values.");
  }

  if (unresolvedCounts.size) {
    console.log("\nUnresolved (need a human decision in Settings → Product Attributes):");
    const rows = [...unresolvedCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, count] of rows) {
      const [scope, key, value] = k.split("|");
      console.log(`  ${String(count).padStart(6)} × ${scope}.${key}: "${value}"`);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(WRITE ? "Summary (applied)" : "Summary (dry run — nothing written)");
  console.log(`Products scanned:  ${scanned}`);
  console.log(`Products ${WRITE ? "updated" : "to update"}:  ${touched}`);
  if (failed) console.log(`Failed:            ${failed}`);
  if (!WRITE && touched) console.log("\nRun again with --write to apply.");

  await mongoose.disconnect();
  console.log("\n✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Reconcile failed:", error);
  if (error.name === "MongooseServerSelectionError") {
    console.error("\nCould not reach MongoDB. Pass --uri mongodb://localhost:27017 for a local DB.");
  }
  process.exit(1);
});
