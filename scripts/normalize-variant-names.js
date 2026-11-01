/**
 * Normalize month-range text embedded in product variant names and titles.
 *
 * The attribute migration already converted registry values/labels and product
 * variant options to (`0-3-months`, `0-3M`). Legacy variant display names were
 * generated separately and still look like:
 *
 *   "Muslin Jenna Frock - 0-6 m M"  ->  "Muslin Jenna Frock - 0-6M"
 *   "Sleep Suit Without Hood - 3-6m" ->  "Sleep Suit Without Hood - 3-6M"
 *
 * Only month tokens are touched; colours, prints and other words are preserved.
 * Order snapshots are deliberately NOT migrated - clients format them at
 * display time via formatVariantName().
 *
 * Variant names whose trailing month token disagrees with the variant's own
 * `size` attribute are reconciled to the attribute (e.g. a 0-6M name on a
 * variant whose size is `0-3-months` becomes 0-3M). Disable with
 * --no-sync-size.
 *
 * Dry-run by default:
 *   node scripts/normalize-variant-names.js
 *   node scripts/normalize-variant-names.js --apply
 *   node scripts/normalize-variant-names.js --skip-titles
 *   node scripts/normalize-variant-names.js --no-sync-size
 *   node scripts/normalize-variant-names.js --uri <mongodb-url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Product = require("../src/models/Product");
const {
  formatVariantName,
  monthLabelFromSizeValue,
  applySizeLabelToVariantName,
} = require("../src/utils/formatVariantName");
const {
  parseMode,
  hasFlag,
  resolveMongoUri,
  redactUri,
  hostDbOf,
} = require("./lib/cliMode");

const argv = process.argv.slice(2);
const { apply: WRITE } = parseMode(argv, { defaultMode: "dry" });
const SKIP_TITLES = hasFlag(argv, "--skip-titles");
const SYNC_SIZE = !hasFlag(argv, "--no-sync-size");
const MONGO_URI = resolveMongoUri(argv);

const MAX_SAMPLES = 20;
const samples = [];

const stats = {
  productsInspected: 0,
  productsChanged: 0,
  variantNamesChanged: 0,
  sizeSuffixesSynced: 0,
  titlesChanged: 0,
  namesChanged: 0,
  titleCandidatesSkipped: 0,
};

const sample = (line) => {
  if (samples.length < MAX_SAMPLES) samples.push(line);
};

const sizeValueOf = (variant) =>
  (variant.attributes && variant.attributes.size) ||
  (variant.options && variant.options.size) ||
  null;

async function main() {
  if (!MONGO_URI) throw new Error("MONGODB_URI not found");

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
  });

  const target = hostDbOf(MONGO_URI);
  console.log(
    `\nVariant/product name normalization - ${WRITE ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`,
  );
  console.log(`DB: ${target.hosts}/${target.db}`);
  console.log(`URI: ${redactUri(MONGO_URI)}`);
  if (SKIP_TITLES) console.log("Product title/name normalization: disabled (--skip-titles)\n");
  else console.log("Product title/name normalization: enabled (use --skip-titles to disable)\n");
  console.log(
    `Variant size-suffix sync: ${SYNC_SIZE ? "enabled (use --no-sync-size to disable)" : "disabled"}\n`,
  );

  const products = await Product.find(
    {},
    { title: 1, name: 1, variants: 1 },
  ).lean();
  stats.productsInspected = products.length;

  for (const product of products) {
    const update = {};

    const variants = product.variants || [];
    let variantsChanged = false;
    const nextVariants = variants.map((variant) => {
      if (!variant || !variant.name) return variant;
      let nextName = formatVariantName(variant.name);
      if (SYNC_SIZE) {
        const sizeLabel = monthLabelFromSizeValue(sizeValueOf(variant));
        if (sizeLabel) {
          const synced = applySizeLabelToVariantName(nextName, sizeLabel);
          if (synced !== nextName) {
            stats.sizeSuffixesSynced += 1;
            sample(`size suffix: "${variant.name}" -> "${synced}"`);
            nextName = synced;
          }
        }
      }
      if (nextName === variant.name) return variant;
      variantsChanged = true;
      stats.variantNamesChanged += 1;
      if (nextName === formatVariantName(variant.name)) {
        sample(`variant: "${variant.name}" -> "${nextName}"`);
      }
      return { ...variant, name: nextName };
    });
    if (variantsChanged) update.variants = nextVariants;

    if (!SKIP_TITLES) {
      if (product.title) {
        const nextTitle = formatVariantName(product.title);
        if (nextTitle !== product.title) {
          stats.titlesChanged += 1;
          update.title = nextTitle;
          sample(`title: "${product.title}" -> "${nextTitle}"`);
        }
      }
      if (product.name) {
        const nextName = formatVariantName(product.name);
        if (nextName !== product.name) {
          stats.namesChanged += 1;
          update.name = nextName;
          sample(`name: "${product.name}" -> "${nextName}"`);
        }
      }
    } else {
      const titleHasMonth =
        formatVariantName(product.title) !== (product.title || "");
      const nameHasMonth = formatVariantName(product.name) !== (product.name || "");
      if (titleHasMonth || nameHasMonth) stats.titleCandidatesSkipped += 1;
    }

    if (!Object.keys(update).length) continue;

    stats.productsChanged += 1;
    if (WRITE) {
      await Product.updateOne({ _id: product._id }, { $set: update });
    }
  }

  console.log("=".repeat(58));
  console.log("Summary");
  console.log("=".repeat(58));
  console.log(`Products inspected          : ${stats.productsInspected}`);
  console.log(`Products ${WRITE ? "updated" : "to update"}            : ${stats.productsChanged}`);
  console.log(`Variant names ${WRITE ? "changed" : "to change"}       : ${stats.variantNamesChanged}`);
  console.log(`Size suffixes ${WRITE ? "synced" : "to sync"}       : ${stats.sizeSuffixesSynced}`);
  console.log(`Product titles ${WRITE ? "changed" : "to change"}      : ${stats.titlesChanged}`);
  console.log(`Product names ${WRITE ? "changed" : "to change"}       : ${stats.namesChanged}`);
  if (SKIP_TITLES) {
    console.log(`Title candidates skipped    : ${stats.titleCandidatesSkipped}`);
  }

  console.log("\nSample changes (first 20):");
  if (samples.length) samples.forEach((line) => console.log(`  - ${line}`));
  else console.log("  (none)");

  if (WRITE) {
    console.log("\nWrites complete. Reindex search if product titles changed.");
  } else {
    console.log("\nNo writes were made. Re-run with --apply to persist.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Variant name normalization failed:", error.message || error);
  process.exit(1);
});
