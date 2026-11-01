/**
 * Replace the bare letter size value "l" with the registry value "large".
 * If "large" already exists, merge the old row into it.
 *
 * Dry-run by default:
 *   node scripts/fix-letter-size-values.js
 *   node scripts/fix-letter-size-values.js --apply
 *   node scripts/fix-letter-size-values.js --uri <mongodb-url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const { rewriteProductReferences, matchTokensFor } = require("../src/utils/attributeValueRewrite");
const { parseMode, resolveMongoUri, redactUri } = require("./lib/cliMode");

const argv = process.argv.slice(2);
const { apply: APPLY } = parseMode(argv, { defaultMode: "dry" });
const MONGO_URI = resolveMongoUri(argv);
const TARGET_VALUE = "large";
const TARGET_LABEL = "Large";
const REQUIRED_SYNONYMS = ["l", "lg", "size-l"];
const isLetterL = (value) => String(value ?? "").trim().toLowerCase() === "l";
const isLarge = (value) => String(value ?? "").trim().toLowerCase() === TARGET_VALUE;

const getEntries = (value) => {
  if (value instanceof Map) return [...value.entries()];
  if (value && typeof value === "object") return Object.entries(value);
  return [];
};

const hasLetterL = (value) => isLetterL(value);

function inspectProduct(product, sourceTokens) {
  let references = 0;
  const count = (value) => {
    if (sourceTokens.has(String(value ?? "").trim().toLowerCase())) references += 1;
  };

  for (const [code, value] of getEntries(product.attributes)) {
    if (String(code).toLowerCase() === "size") count(value);
  }
  for (const [code, values] of getEntries(product.filterAttributes)) {
    if (String(code).toLowerCase() === "size" && Array.isArray(values)) {
      values.forEach(count);
    }
  }
  for (const option of product.variantOptions || []) {
    if (String(option?.code || option?.name || "").toLowerCase() !== "size") continue;
    for (const value of option.values || []) count(value?.value);
  }
  for (const variant of product.variants || []) {
    for (const field of [variant.attributes, variant.options]) {
      for (const [code, value] of getEntries(field)) {
        if (String(code).toLowerCase() === "size") count(value);
      }
    }
  }
  return references;
}

async function main() {
  console.log("\nFixing the letter size value l → large");
  console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`);
  console.log(`Connecting to: ${redactUri(MONGO_URI)}\n`);
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const attribute = await AttributeDefinition.findOne({ code: "size" });
  if (!attribute) throw new Error('AttributeDefinition "size" was not found.');

  const rows = (attribute.allowedValues || []).map((row) =>
    row.toObject ? row.toObject() : { ...row },
  );
  const sources = rows.filter((row) => isLetterL(row.value));
  const existingLarge = rows.find((row) => isLarge(row.value));
  const rewriteSources = sources.length
    ? sources
    : [{ value: "l", label: "L", synonyms: REQUIRED_SYNONYMS }];

  const target = existingLarge
    ? { ...existingLarge }
    : sources.length
      ? { ...sources[0] }
      : null;

  if (!target && !existingLarge) {
    console.log('No "l" or "large" registry row exists; nothing to change.');
    await mongoose.disconnect();
    return;
  }

  const sourceTokens = new Set(
    rewriteSources.flatMap((source) => matchTokensFor(source))
      .map((token) => String(token).trim().toLowerCase())
      .filter(Boolean),
  );
  const nextSynonyms = new Set([
    ...(Array.isArray(target.synonyms) ? target.synonyms : []),
    ...sources.flatMap((source) => [
      source.value,
      source.label,
      ...(Array.isArray(source.synonyms) ? source.synonyms : []),
    ]),
    ...REQUIRED_SYNONYMS,
  ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean));
  nextSynonyms.delete(TARGET_VALUE);
  nextSynonyms.delete(TARGET_LABEL.toLowerCase());

  const nextTarget = {
    ...target,
    value: TARGET_VALUE,
    label: TARGET_LABEL,
    synonyms: [...nextSynonyms],
  };
  if (Object.prototype.hasOwnProperty.call(nextTarget, "needsReview")) {
    nextTarget.needsReview = false;
  }

  const nextAllowedValues = [];
  let insertedTarget = false;
  for (const row of rows) {
    if (row === existingLarge) {
      nextAllowedValues.push(nextTarget);
      insertedTarget = true;
      continue;
    }
    if (isLetterL(row.value)) continue;
    nextAllowedValues.push(row);
  }
  if (!insertedTarget) nextAllowedValues.push(nextTarget);

  const products = await Product.find({}).select(
    "attributes filterAttributes variantOptions variants.attributes variants.options",
  ).lean();
  const affectedProducts = products
    .map((product) => ({ product, references: inspectProduct(product, sourceTokens) }))
    .filter((entry) => entry.references > 0);
  const explicitFilterProducts = products.filter((product) =>
    (product.filterAttributes?.size || []).some(hasLetterL),
  );

  console.log(`Size rows named l:             ${sources.length}`);
  console.log(`Existing large row:            ${existingLarge ? "yes (merge)" : "no (rename)"}`);
  console.log(`Products with l references:    ${affectedProducts.length}`);
  console.log(`Explicit filterAttributes fix: ${explicitFilterProducts.length} product(s)`);
  console.log(`Target value / label:          ${TARGET_VALUE} / ${TARGET_LABEL}`);
  console.log(`Target synonyms:               ${nextTarget.synonyms.join(", ")}`);

  if (!APPLY) {
    console.log("\nDry run complete — nothing was written. Re-run with --apply to apply these changes.");
    await mongoose.disconnect();
    return;
  }

  await AttributeDefinition.updateOne(
    { _id: attribute._id },
    { $set: { allowedValues: nextAllowedValues } },
  );

  const rewrite = sources.length
    ? await rewriteProductReferences(attribute, nextTarget, sources)
    : await rewriteProductReferences(attribute, nextTarget, rewriteSources);

  // The generic rewrite helper compares normalized filter tokens. Both l and
  // large normalize to "l", so explicitly repair the stored display slugs.
  const filterOps = explicitFilterProducts.map(({ _id, filterAttributes }) => {
    const original = Array.isArray(filterAttributes?.size) ? filterAttributes.size : [];
    const next = [...new Set(original.map((value) => hasLetterL(value) ? TARGET_VALUE : value))];
    return {
      updateOne: {
        filter: { _id },
        update: { $set: { "filterAttributes.size": next } },
      },
    };
  });
  let filterProductsUpdated = 0;
  if (filterOps.length) {
    const result = await Product.bulkWrite(filterOps, { ordered: false });
    filterProductsUpdated = result.modifiedCount || 0;
  }

  console.log("\nApplied successfully.");
  console.log(`Products rewritten by helper:  ${rewrite.products}`);
  console.log(`Variants rewritten:            ${rewrite.variants}`);
  console.log(`Variant option values rewritten: ${rewrite.options}`);
  console.log(`Helper skips:                   ${rewrite.skipped}`);
  console.log(`Filter products explicitly updated: ${filterProductsUpdated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("❌ Letter-size migration failed:", error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
