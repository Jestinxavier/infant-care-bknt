/**
 * One-off catalogue cleanup: merge duplicate Material values into their
 * canonical value and fix the two spec-dump names. Reuses the SAME logic as
 * the merge endpoint (rewriteProductReferences + synonym folding), so every
 * affected product's filterAttributes / variant values are rewritten and the
 * merged codes become aliases (filters keep matching old spellings).
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/migrate-material-values.js          # dry run
 *   node scripts/migrate-material-values.js --write
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const { refreshAttributeAliasLookups } = require("../src/utils/filterAttributeRules");
const {
  toValueToken: normalizeValueToken,
  toSlug,
  MERGE_SYNONYM_CAP,
} = require("../src/utils/attributeValuePolicy");
const { rewriteProductReferences } = require("../src/utils/attributeValueRewrite");

const { apply: WRITE } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "dry" });
const ATTR_CODE = "material";

// Each entry: canonical/target value → { label?, newValue?, mergeAway?: [] }
//   label    — override the target's display label
//   newValue — rename the target's value code (products holding the old code
//              are rewritten; old code kept as a synonym alias)
//   mergeAway— source value codes folded into the target
const PLAN = {
  // 8 misspellings of soft knitted cotton → the 934-use canonical
  "soft-knitted-cotton": {
    mergeAway: [
      "soft-kniytted-cotton",
      "soft-knittede-cotton",
      "sopft-knitted-cotton",
      "soft-knitteds-cotton",
      "soft-knittred-cotton",
      "soft-knitted-cottton",
      "soft-knitted-cottonm",
    ],
  },
  "crinkled-muslin": { mergeAway: ["crinklred-muslin"] },
  // Both are polyester → one value: fold the "Outer100" spelling in, rename the
  // spec-dump code to `polyester`, and keep both old codes as aliases.
  // (Already-merged sources are idempotent no-ops.)
  "100-polyster": {
    newValue: "polyester",
    label: "Polyester",
    mergeAway: ["outer100-polyster"],
  },
  // Fold the misspelled spelling in, rename the spec-dump code, keep both old
  // codes as aliases.
  "polyurethane-coatedinner100polysterliner-insert88polyster": {
    newValue: "polyurethane-coated-polyester",
    label: "Polyurethane Coated Polyester",
    mergeAway: ["polyurethene-coatedinner100polysterliner-insert88polyster"],
  },
  // 12nylon (23 reusable diapers) is a spec fragment meaning nylon — rename
  // the code to `nylon` and label "Nylon".
  "12nylon": { newValue: "nylon", label: "Nylon" },
  // Three bath-mat spellings of the same material → one clean canonical.
  // The target `soft-mesh-fabric` doesn't exist yet; create it on write.
  "soft-mesh-fabric": {
    create: true,
    label: "Soft Mesh Fabric",
    mergeAway: [
      "soft-mesh-fabric-baby-bath-mat-with-a-waterproof-inner-lining",
      "soft-mesh-fabric-with-a-waterproof-inner-lining",
      "mesh-fabric-baby-bath-mat-with-a-waterproof-inner-lining",
    ],
  },
};

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  console.log(
    `\n${WRITE ? "✍️  Cleanup Material values (WRITE)" : "🔎 Cleanup Material values (dry run — pass --write)"}\n`,
  );

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const attribute = await AttributeDefinition.findOne({ code: ATTR_CODE });
  if (!attribute) {
    console.error(`Attribute "${ATTR_CODE}" not found`);
    process.exit(1);
  }

  let totalProducts = 0;
  let totalVariants = 0;
  let totalOptions = 0;

  for (const [targetValue, { label, newValue, create, mergeAway }] of Object.entries(PLAN)) {
    let target = attribute.allowedValues.find((v) => v.value === targetValue);
    const creating = create && !target;
    if (!target && !creating) {
      console.log(`  ⚠️  target "${targetValue}" not found — skipped`);
      continue;
    }
    const sources = (mergeAway || [])
      .map((s) => attribute.allowedValues.find((v) => v.value === normalizeValueToken(s)))
      .filter(Boolean);

    const finalValue = newValue || targetValue;
    const header =
      (creating ? "Create → " : newValue ? "Rename → " : "Merge → ") +
      `"${finalValue}"` +
      (label ? ` (label → "${label}")` : "") +
      (newValue && !creating ? ` (was "${targetValue}")` : "") +
      (sources.length ? `  |  ${sources.length} source(s)` : "");
    console.log(`─`.repeat(72));
    console.log(header);
    for (const s of sources) console.log(`   ← ${s.value}  (${s.label})`);

    if (!WRITE) continue;

    // If the target already holds `newValue` (from a prior run), skip the
    // rename rewrite but still apply label/synonym/merge work.
    const targetValueCode = target ? target.value : finalValue;
    const renaming = Boolean(newValue) && targetValueCode !== finalValue;

    // Snapshot sources to plain objects now — attribute.save() mutates/detaches
    // the subdocs, and rewriteProductReferences needs the original value+label.
    const sourceSnapshots = sources.map((s) => ({
      value: s.value,
      label: s.label,
      synonyms: [...(s.synonyms || [])],
    }));

    // Create the target subdoc if it doesn't exist yet.
    if (creating) {
      attribute.allowedValues.push({
        value: finalValue,
        label: label || finalValue,
        synonyms: [],
        isActive: true,
      });
      target = attribute.allowedValues[attribute.allowedValues.length - 1];
    }

    // Fold source codes/labels/aliases into the target synonyms so filters
    // keep matching the old spellings.
    const synonymSet = new Set(target.synonyms || []);
    synonymSet.delete(finalValue);
    for (const src of sourceSnapshots) {
      synonymSet.add(src.value);
      const labelSlug = toSlug(src.label);
      if (labelSlug && labelSlug !== finalValue) synonymSet.add(labelSlug);
      for (const syn of src.synonyms || []) {
        const t = normalizeValueToken(syn);
        if (t && t !== finalValue) synonymSet.add(t);
      }
    }

    let rewriteTarget = { value: finalValue, label: label || target.label };

    if (renaming) {
      // Rewrite products holding the old code → the new code. The old code
      // becomes an alias so existing filters still resolve.
      synonymSet.add(targetValueCode);
      const renamed = await rewriteProductReferences(
        attribute,
        rewriteTarget,
        [{ value: targetValueCode, label: target.label, synonyms: [] }],
      );
      totalProducts += renamed.products;
      totalVariants += renamed.variants;
      totalOptions += renamed.options || 0;
      console.log(
        `   ✓ renamed: ${renamed.products} product(s), ${renamed.variants} variant(s), ${renamed.options || 0} option(s)`,
      );
    }

    // Merge sources into the target (while they're still registered).
    if (sourceSnapshots.length) {
      const merged = await rewriteProductReferences(
        attribute,
        rewriteTarget,
        sourceSnapshots,
      );
      totalProducts += merged.products;
      totalVariants += merged.variants;
      totalOptions += merged.options || 0;
      console.log(
        `   ✓ merged: ${merged.products} product(s), ${merged.variants} variant(s), ${merged.options || 0} option(s)`,
      );
    }

    if (label) target.label = label;
    target.value = finalValue;
    target.synonyms = Array.from(synonymSet).slice(0, MERGE_SYNONYM_CAP);

    const removed = new Set(sourceSnapshots.map((s) => s.value));
    attribute.allowedValues = attribute.allowedValues.filter(
      (v) => !removed.has(v.value),
    );

    await attribute.save();
    await refreshAttributeAliasLookups().catch(() => {});
  }

  console.log(`\n${"=".repeat(72)}`);
  if (WRITE) {
    console.log("Summary (applied)");
    console.log(`Products rewritten: ${totalProducts}`);
    console.log(`Variants rewritten: ${totalVariants}`);
    console.log(`Options rewritten:  ${totalOptions}`);
  } else {
    console.log("Dry run — nothing written. Run with --write to apply.");
  }

  await mongoose.disconnect();
  console.log("\n✅ Done");
}

main().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});
