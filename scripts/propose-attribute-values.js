/**
 * Derive-and-propose: reads what values products ALREADY store for each
 * attribute (filterAttributes + variant attributes/options) and proposes an
 * approved-value list per attribute for the catalogue.
 *
 * Read-only by default. Prints, per attribute:
 *   - values in use but NOT yet registered (candidates to add)
 *   - registered values NOT in use (candidates to retire)
 *   - junk candidates (flagged by the shared policy)
 *
 * Usage:
 *   node scripts/propose-attribute-values.js                       # all attrs
 *   node scripts/propose-attribute-values.js --attribute occasion
 *   node scripts/propose-attribute-values.js --uri <mongodb-url>
 *   node scripts/propose-attribute-values.js --json > proposal.json
 *
 * Nothing is written. Use the output to seed/edit the catalogue in
 * Settings → Product Attributes, or feed it to a later --write pass.
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Product = require("../src/models/Product");
const AttributeDefinition = require("../src/models/AttributeDefinition");
const { findRegisteredAllowedValue } = require("../src/utils/attributeCatalogGuard");
const { reviewFlagsFor } = require("../src/utils/attributeValuePolicy");

const URI_FLAG = process.argv.indexOf("--uri");
const ATTR_FLAG = process.argv.indexOf("--attribute");
const JSON_MODE = process.argv.includes("--json");
const MONGO_URI_OVERRIDE =
  URI_FLAG !== -1 && process.argv[URI_FLAG + 1]
    ? process.argv[URI_FLAG + 1]
    : null;
const ATTRIBUTE_FILTER =
  ATTR_FLAG !== -1 && process.argv[ATTR_FLAG + 1]
    ? String(process.argv[ATTR_FLAG + 1]).toLowerCase()
    : null;

// The nine product-level filter attributes (Product.filterAttributes schema).
const FILTER_KEYS = [
  "color",
  "size",
  "material",
  "season",
  "gender",
  "sleeve",
  "occasion",
  "pattern",
  "pack",
];

const token = (s) =>
  String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const titleCase = (s) =>
  String(s || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

async function main() {
  const mongoUri =
    MONGO_URI_OVERRIDE || process.env.MONGODB_URI || "mongodb://localhost:27017";

  if (!JSON_MODE) {
    console.log("\n📊 Proposing attribute values from existing products (read-only)");
    console.log(`Connecting to: ${mongoUri.replace(/\/\/[^@]*@/, "//***@")}\n`);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const attributes = await AttributeDefinition.find(
    ATTRIBUTE_FILTER ? { code: ATTRIBUTE_FILTER } : {}
  )
    .sort({ position: 1, createdAt: 1 })
    .lean();

  // usage[code] = Map<normalizedToken, { raw, count }>
  const usage = new Map();
  for (const key of FILTER_KEYS) usage.set(key, new Map());

  const bump = (code, raw) => {
    const t = token(raw);
    if (!t) return;
    let m = usage.get(code);
    if (!m) {
      m = new Map();
      usage.set(code, m);
    }
    const prev = m.get(t);
    if (prev) prev.count += 1;
    else m.set(t, { raw: String(raw).trim(), count: 1 });
  };

  const products = await Product.find({})
    .select("filterAttributes variants.attributes variants.options")
    .lean();

  for (const product of products) {
    const fa = product.filterAttributes || {};
    for (const [key, value] of Object.entries(fa)) {
      const code = String(key).toLowerCase().trim();
      const values = Array.isArray(value) ? value : [value];
      for (const raw of values) bump(code, raw);
    }
    for (const variant of product.variants || []) {
      const attrs = variant.attributes || variant.options || {};
      for (const [key, value] of Object.entries(attrs)) {
        const code = String(key).toLowerCase().trim();
        bump(code, value);
      }
    }
  }

  const proposal = {};

  for (const attribute of attributes) {
    const code = attribute.code;
    const used = usage.get(code) || new Map();
    const registered = Array.isArray(attribute.allowedValues)
      ? attribute.allowedValues
      : [];

    const registeredTokens = new Set(
      registered.map((av) => token(av.value || av.label))
    );

    // Values in use but not registered (sorted by usage desc)
    const unregistered = [...used.entries()]
      .filter(([t]) => !registeredTokens.has(t))
      .sort((a, b) => b[1].count - a[1].count)
      .map(([t, info]) => ({
        value: t,
        label: titleCase(info.raw),
        raw: info.raw,
        count: info.count,
        flags: reviewFlagsFor(info.raw, t),
      }));

    // Registered but unused
    const unused = registered
      .filter((av) => !used.has(token(av.value || av.label)))
      .map((av) => ({ value: av.value, label: av.label }));

    proposal[code] = {
      label: attribute.label,
      role: attribute.role,
      registeredCount: registered.length,
      usedCount: used.size,
      unregistered,
      unused,
    };

    if (JSON_MODE) continue;

    console.log(`─`.repeat(72));
    console.log(
      `${attribute.label} (${code}) — ${registered.length} registered · ${used.size} in use`
    );
    if (unregistered.length === 0 && registered.length > 0) {
      console.log("  ✅ every used value is registered");
    }
    if (registered.length === 0) {
      console.log("  ⚠️  NO approved values registered — attribute is blocked by the guard");
    }
    if (unregistered.length) {
      console.log(`  ➕ ${unregistered.length} value(s) in use but NOT registered:`);
      for (const entry of unregistered) {
        const flags = entry.flags.length
          ? `  ⚠️  [${entry.flags.join(", ")}]`
          : "";
        console.log(
          `       • "${entry.raw}"  (used by ${entry.count}) → suggest value "${entry.value}", label "${entry.label}"${flags}`
        );
      }
    }
    if (unused.length) {
      console.log(`  ➖ ${unused.length} registered value(s) not in use by any product`);
    }
  }

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
  } else {
    console.log(`\n${"=".repeat(72)}`);
    console.log("Summary (read-only — nothing was written)");
    console.log(`Products scanned:   ${products.length}`);
    console.log(`Attributes scanned: ${attributes.length}`);
    const blocked = attributes.filter(
      (a) => !a.allowedValues || a.allowedValues.length === 0
    );
    if (blocked.length) {
      console.log(`⚠️  Attributes with NO values (blocked): ${blocked.map((a) => a.code).join(", ")}`);
    }
    console.log(
      "\nNext: review the suggestions, then register them in Settings →\n" +
        "Product Attributes (or with a --write seed pass). Flags tagged ⚠️\n" +
        "are junk — fix or rename before registering."
    );
  }

  await mongoose.disconnect();
  if (!JSON_MODE) console.log("\n✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Propose failed:", error);
  if (error.name === "MongooseServerSelectionError") {
    console.error(
      "\nCould not reach MongoDB. Pass --uri mongodb://localhost:27017 for a local DB."
    );
  }
  process.exit(1);
});
