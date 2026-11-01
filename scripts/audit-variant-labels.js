/**
 * Read-only audit for month-range label consistency.
 *
 * Verifies that:
 *   - every size variant option / variant attribute uses a registry value;
 *   - no product title or variant name still contains a legacy month spelling;
 *   - every variant name's trailing month token matches its own size attribute.
 *
 * Never writes. Exits non-zero when month-related inconsistencies remain.
 *
 *   node scripts/audit-variant-labels.js
 *   node scripts/audit-variant-labels.js --uri <mongodb-url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Product = require("../src/models/Product");
const AttributeDefinition = require("../src/models/AttributeDefinition");
const {
  monthLabelFromSizeValue,
} = require("../src/utils/formatVariantName");
const { resolveMongoUri, redactUri, hostDbOf } = require("./lib/cliMode");

const MONGO_URI = resolveMongoUri(process.argv.slice(2));
const MAX_SAMPLES = 10;

// A month token that is not already in the canonical "a-bM" form.
const LEGACY_MONTH_TOKEN =
  /(\d{1,2})\s*[-\u2010-\u2015_ ]\s*(\d{1,2})\s*(months?|mon|mo|m)\b/i;

function legacyMonthIn(text) {
  if (!text) return false;
  const match = String(text).match(LEGACY_MONTH_TOKEN);
  if (!match) return false;
  if (match[3].toLowerCase() !== "m") return true;
  return match[0] !== `${match[1]}-${match[2]}M`;
}

const sizeValueOf = (variant) =>
  (variant.attributes && variant.attributes.size) ||
  (variant.options && variant.options.size) ||
  null;

async function main() {
  if (!MONGO_URI) throw new Error("MONGODB_URI not found");
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });

  const target = hostDbOf(MONGO_URI);
  console.log("\nMonth-range label audit (read-only)");
  console.log(`DB: ${target.hosts}/${target.db}`);
  console.log(`URI: ${redactUri(MONGO_URI)}\n`);

  const sizeDef = await AttributeDefinition.findOne({ code: "size" }).lean();
  const values = new Set((sizeDef?.allowedValues || []).map((v) => v.value));
  console.log(`Registry size values: ${values.size}`);

  const badOptionValues = new Map();
  const badVariantValues = new Map();
  const legacyNames = [];
  const legacyTitles = [];
  const suffixMismatches = [];
  let products = 0;
  let variants = 0;
  let staleNameSuffixes = 0;

  const cursor = Product.find(
    {},
    { title: true, variantOptions: true, variants: true },
  ).lean();

  for await (const product of cursor) {
    products += 1;

    if (legacyMonthIn(product.title) && legacyTitles.length < MAX_SAMPLES) {
      legacyTitles.push(product.title);
    }

    for (const option of product.variantOptions || []) {
      if (String(option.code || "").toLowerCase() !== "size") continue;
      for (const entry of option.values || []) {
        const value = typeof entry === "string" ? entry : entry.value;
        if (!values.has(value)) {
          badOptionValues.set(value, (badOptionValues.get(value) || 0) + 1);
        }
      }
    }

    for (const variant of product.variants || []) {
      variants += 1;
      const name = variant.name || "";

      if (legacyMonthIn(name) && legacyNames.length < MAX_SAMPLES) {
        legacyNames.push(name);
      }

      const value = sizeValueOf(variant);
      if (value && !values.has(value)) {
        badVariantValues.set(value, (badVariantValues.get(value) || 0) + 1);
      }

      const label = monthLabelFromSizeValue(value);
      if (label && name && !name.endsWith(` - ${label}`)) {
        staleNameSuffixes += 1;
        if (suffixMismatches.length < MAX_SAMPLES) {
          suffixMismatches.push({
            name,
            expected: ` - ${label}`,
            product: product.title,
          });
        }
      }
    }
  }

  const print = (title, map) =>
    console.log(
      `${title}: ${map.size === 0 ? "none" : ""}\n` +
        [...map.entries()]
          .map(([value, count]) => `  - ${value} (${count})`)
          .join("\n"),
    );

  console.log(`\nProducts checked: ${products}`);
  console.log(`Variants checked: ${variants}\n`);
  print("Non-registry size option values", badOptionValues);
  print("\nNon-registry variant size attributes", badVariantValues);

  console.log(`\nLegacy month spellings in titles: ${legacyTitles.length}`);
  legacyTitles.forEach((t) => console.log(`  - ${t}`));
  console.log(`\nLegacy month spellings in variant names: ${legacyNames.length}`);
  legacyNames.forEach((n) => console.log(`  - ${n}`));
  console.log(`\nStale month suffixes in variant names: ${staleNameSuffixes}`);
  suffixMismatches.forEach((m) =>
    console.log(`  - "${m.name}" (expected "${m.expected}") [${m.product}]`),
  );

  await mongoose.disconnect();

  const monthIssues =
    badOptionValues.size +
    badVariantValues.size +
    legacyTitles.length +
    legacyNames.length +
    staleNameSuffixes;
  if (monthIssues > 0) {
    console.log("\n❌ Month-label issues found.");
    process.exitCode = 1;
  } else {
    console.log("\n✅ Month labels are consistent.");
  }
}

main().catch(async (error) => {
  console.error("Audit failed:", error.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
