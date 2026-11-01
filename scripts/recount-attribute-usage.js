/**
 * Recount distinct products using each AttributeDefinition and synchronize
 * usageCount/isLocked from all current product storage locations.
 *
 * Dry-run by default:
 *   node scripts/recount-attribute-usage.js
 *   node scripts/recount-attribute-usage.js --apply
 *   node scripts/recount-attribute-usage.js --uri <mongodb-url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const { parseMode, resolveMongoUri, redactUri } = require("./lib/cliMode");

const argv = process.argv.slice(2);
const { apply: APPLY } = parseMode(argv, { defaultMode: "dry" });
const MONGO_URI = resolveMongoUri(argv);

const entriesOf = (value) => {
  if (value instanceof Map) return [...value.entries()];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value);
  }
  return [];
};

const normalizeCode = (value) => String(value ?? "").trim().toLowerCase();
const hasValue = (value) => {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

function codesUsedBy(product) {
  const codes = new Set();

  for (const option of product.variantOptions || []) {
    const code = normalizeCode(option?.code || option?.name);
    if (code && (option.values || []).some((value) => hasValue(value?.value))) {
      codes.add(code);
    }
  }

  for (const variant of product.variants || []) {
    for (const field of [variant.attributes, variant.options]) {
      for (const [code] of entriesOf(field)) {
        const normalized = normalizeCode(code);
        const value = field instanceof Map ? field.get(code) : field[code];
        if (normalized && hasValue(value)) codes.add(normalized);
      }
    }
  }

  for (const field of [product.attributes, product.filterAttributes]) {
    for (const [code, value] of entriesOf(field)) {
      const normalized = normalizeCode(code);
      if (normalized && hasValue(value)) codes.add(normalized);
    }
  }

  return codes;
}

async function main() {
  console.log("\nRecounting attribute usage across products");
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);
  console.log(`Connecting to: ${redactUri(MONGO_URI)}\n`);
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const [definitions, products] = await Promise.all([
    AttributeDefinition.find({}).select("_id code usageCount isLocked").lean(),
    Product.find({})
      .select("variantOptions.code variantOptions.name variants.attributes variants.options attributes filterAttributes")
      .lean(),
  ]);

  const counts = new Map(definitions.map((definition) => [normalizeCode(definition.code), 0]));
  for (const product of products) {
    for (const code of codesUsedBy(product)) {
      if (counts.has(code)) counts.set(code, counts.get(code) + 1);
    }
  }

  let changed = 0;
  for (const definition of definitions) {
    const code = normalizeCode(definition.code);
    const usageCount = counts.get(code) || 0;
    const isLocked = usageCount > 0;
    const differs = definition.usageCount !== usageCount || definition.isLocked !== isLocked;
    console.log(
      `  ${code.padEnd(24)} ${String(definition.usageCount ?? 0).padStart(5)} → ${String(usageCount).padStart(5)} products` +
        `${definition.isLocked !== isLocked ? ` | isLocked ${definition.isLocked} → ${isLocked}` : ""}`,
    );

    if (differs) {
      changed += 1;
      if (APPLY) {
        await AttributeDefinition.updateOne(
          { _id: definition._id },
          { $set: { usageCount, isLocked } },
        );
      }
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log(`Attribute definitions: ${definitions.length}`);
  console.log(`Products scanned:      ${products.length}`);
  console.log(`Definitions to update: ${changed}`);
  console.log(APPLY ? "Mode: APPLY complete" : "Mode: DRY RUN — nothing written");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("❌ Attribute usage recount failed:", error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
