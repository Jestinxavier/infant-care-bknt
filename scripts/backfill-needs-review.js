/**
 * One-off backfill: stamps the `needsReview` flag onto existing allowed
 * values using the shared attribute-value policy (attributeValuePolicy.js),
 * so the amber "Review" badges show in the admin UI without editing each
 * value by hand.
 *
 * Dry run by default — prints what would change, writes nothing.
 * Only ever touches the boolean `needsReview` field (surgical $set);
 * labels, codes and ordering are never modified.
 *
 * Usage:
 *   node scripts/backfill-needs-review.js                      # dry run
 *   node scripts/backfill-needs-review.js --write              # apply
 *   node scripts/backfill-needs-review.js --attribute material # one attribute
 *   node scripts/backfill-needs-review.js --write --uri <url>
 *
 * Flags:
 *   --write             Persist the computed flags. Without it nothing changes.
 *   --attribute <code>  Only process one attribute (e.g. material)
 *   --uri <url>         Override the Mongo connection string. Defaults to
 *                       MONGODB_URI in .env, then mongodb://localhost:27017
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const { reviewFlagsFor } = require("../src/utils/attributeValuePolicy");

const URI_FLAG = process.argv.indexOf("--uri");
const ATTR_FLAG = process.argv.indexOf("--attribute");
const { apply: WRITE } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "dry" });
const MONGO_URI_OVERRIDE =
  URI_FLAG !== -1 && process.argv[URI_FLAG + 1]
    ? process.argv[URI_FLAG + 1]
    : null;
const ATTRIBUTE_FILTER =
  ATTR_FLAG !== -1 && process.argv[ATTR_FLAG + 1]
    ? String(process.argv[ATTR_FLAG + 1]).toLowerCase()
    : null;

async function main() {
  const mongoUri =
    MONGO_URI_OVERRIDE ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017";

  console.log(
    `\n${WRITE ? "✍️  Backfilling needsReview (WRITE mode)" : "🔎 Backfill needsReview (dry run — pass --write to apply)"}`,
  );
  console.log(`Connecting to: ${mongoUri.replace(/\/\/[^@]*@/, "//***@")}\n`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const filter = ATTRIBUTE_FILTER ? { code: ATTRIBUTE_FILTER } : {};
  const attributes = await AttributeDefinition.find(filter)
    .sort({ position: 1, createdAt: 1 })
    .lean();

  let totalValues = 0;
  let toFlag = 0;
  let toClear = 0;
  let unchanged = 0;

  for (const attribute of attributes) {
    const values = attribute.allowedValues || [];
    if (!values.length) continue;
    totalValues += values.length;

    const flips = [];
    for (const value of values) {
      const shouldFlag =
        reviewFlagsFor(value.label, value.value).length > 0;
      const isFlagged = value.needsReview === true;
      if (shouldFlag === isFlagged) {
        unchanged += 1;
        continue;
      }
      flips.push({ value: value.value, label: value.label, shouldFlag });
    }

    if (!flips.length) continue;

    const flagCount = flips.filter((f) => f.shouldFlag).length;
    const clearCount = flips.length - flagCount;
    toFlag += flagCount;
    toClear += clearCount;

    console.log(`─`.repeat(72));
    console.log(
      `${attribute.label} (${attribute.code}) — ${flips.length} change(s): ${flagCount} to flag, ${clearCount} to clear`,
    );
    for (const flip of flips) {
      console.log(
        `  ${flip.shouldFlag ? "🚩 flag  " : "✨ clear "} ${flip.label}  (${flip.value})`,
      );
    }

    if (WRITE) {
      // Load the full doc and save so the pre-save hook can normalise/dedupe.
      const doc = await AttributeDefinition.findById(attribute._id);
      const byValue = new Map(flips.map((f) => [f.value, f.shouldFlag]));
      for (const av of doc.allowedValues) {
        if (byValue.has(av.value)) av.needsReview = byValue.get(av.value);
      }
      await doc.save();
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    WRITE
      ? "Summary (changes applied)"
      : "Summary (dry run — nothing was changed)",
  );
  console.log(`Attributes scanned: ${attributes.length}`);
  console.log(`Values scanned:     ${totalValues}`);
  console.log(`Flagged (needsReview = true):  ${toFlag}`);
  console.log(`Cleared (needsReview = false): ${toClear}`);
  console.log(`Already correct:               ${unchanged}`);
  if (!WRITE && toFlag + toClear > 0) {
    console.log("\nRun again with --write to apply.");
  }

  await mongoose.disconnect();
  console.log("\n✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Backfill failed:", error);
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
