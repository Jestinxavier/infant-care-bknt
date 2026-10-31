/**
 * Read-only cleanup report: lists allowed values that trip the shared
 * attribute-value policy (attributeValuePolicy.js).
 *
 * Flags values that are overlong, one giant word, or have digits glued to
 * letters inside a word — e.g.
 *   "Polyurethene Coatedinner100polysterliner Insert88polyster"
 * as well as hard policy violations (bad hex, bad slug, ...).
 *
 * Changes NOTHING. Use the admin UI to correct or merge flagged values
 * (Settings → Product Attributes → expand a card → "Merge into…").
 *
 * Usage:
 *   node scripts/review-attribute-values.js [--attribute <code>] [--uri <mongodb-url>]
 *
 * Flags:
 *   --attribute <code>  Only report one attribute (e.g. material)
 *   --uri <url>         Override the Mongo connection string. Defaults to
 *                       MONGODB_URI in .env, then mongodb://localhost:27017
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const {
  validateAllowedValueEntry,
} = require("../src/utils/attributeValuePolicy");

const URI_FLAG = process.argv.indexOf("--uri");
const ATTR_FLAG = process.argv.indexOf("--attribute");
const MONGO_URI_OVERRIDE =
  URI_FLAG !== -1 && process.argv[URI_FLAG + 1]
    ? process.argv[URI_FLAG + 1]
    : null;
const ATTRIBUTE_FILTER =
  ATTR_FLAG !== -1 && process.argv[ATTR_FLAG + 1]
    ? String(process.argv[ATTR_FLAG + 1]).toLowerCase()
    : null;

const FLAG_LABELS = {
  label_too_long: "label too long",
  missing_spaces: "no spaces (giant word)",
  digits_inside_words: "digits glued to letters",
  code_too_long: "code too long",
};

async function main() {
  const mongoUri =
    MONGO_URI_OVERRIDE ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017";

  console.log("\n🔎 Reviewing attribute values (read-only)");
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^@]*@/, "//***@")}\n`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const filter = ATTRIBUTE_FILTER ? { code: ATTRIBUTE_FILTER } : {};
  const attributes = await AttributeDefinition.find(filter)
    .sort({ position: 1, createdAt: 1 })
    .lean();

  let flaggedValues = 0;
  let totalValues = 0;
  const attributesWithFlags = [];

  for (const attribute of attributes) {
    const values = attribute.allowedValues || [];
    if (!values.length) continue;
    totalValues += values.length;

    const rows = [];
    for (const value of values) {
      const res = validateAllowedValueEntry(value, {
        code: attribute.code,
        uiType: attribute.uiType,
      });
      const hardErrors = Object.values(res.errors);
      const flags = res.flags.length
        ? res.flags.map((f) => FLAG_LABELS[f] || f).join(", ")
        : "";
      if (hardErrors.length || flags) {
        rows.push({
          label: value.label,
          code: value.value,
          status: hardErrors.length ? `ERROR: ${hardErrors.join("; ")}` : flags,
          needsReview: value.needsReview === true,
        });
      }
    }

    if (rows.length) {
      flaggedValues += rows.length;
      attributesWithFlags.push(attribute.code);
      console.log(`─`.repeat(72));
      console.log(
        `${attribute.label} (${attribute.code}) — ${rows.length} of ${values.length} value(s) flagged`,
      );
      for (const row of rows) {
        const saved = row.needsReview ? " [saved:needsReview]" : "";
        console.log(`  • ${row.label}`);
        console.log(`      code:  ${row.code}`);
        console.log(`      issue: ${row.status}${saved}`);
      }
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("Summary (read-only — nothing was changed)");
  console.log(`Attributes scanned:    ${attributes.length}`);
  console.log(`Values scanned:        ${totalValues}`);
  console.log(`Values flagged:        ${flaggedValues}`);
  if (attributesWithFlags.length) {
    console.log(`Attributes with flags: ${attributesWithFlags.join(", ")}`);
  }
  if (flaggedValues > 0) {
    console.log(
      "\nNext steps:\n" +
        "  1. Fix labels in bulk via Settings → Product Attributes (edit value).\n" +
        "  2. Combine duplicate spellings with “Merge into…” — merged codes\n" +
        "     become aliases and product references are rewritten automatically.\n" +
        "  3. Hide values you want to retire (Active toggle) instead of deleting.",
    );
  }

  await mongoose.disconnect();
  console.log("\n✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Review failed:", error);
  if (error.name === "MongooseServerSelectionError") {
    console.error(
      "\nCould not reach MongoDB. Tips:\n" +
        "  1. Local dev  → start mongod, or pass:  --uri mongodb://localhost:27017\n" +
        "  2. The .env MONGODB_URI points at Atlas — from a laptop, the Atlas IP\n" +
        '    allowlist must include this machine, or run this script on the VPS.',
    );
  }
  process.exit(1);
});
