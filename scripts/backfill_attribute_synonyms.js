/**
 * Migration Script: Backfill allowedValues[].synonyms from the static alias map
 *
 * Seeds the merchant-managed `synonyms` array on every AttributeDefinition's
 * allowedValues using the bootstrap vocabulary in filterAttributeRules.js.
 * After this runs, synonyms are fully DB-driven — the static map is only a
 * fallback for brand-new deployments.
 *
 * Usage:
 *   node backend/scripts/backfill_attribute_synonyms.js [--dry-run]
 *
 * Flags:
 *   --dry-run    Preview changes without saving to database
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const {
  FILTER_ATTRIBUTE_DEFINITIONS,
  normalizeFilterTokenByKey,
  refreshAttributeAliasLookups,
} = require("../src/utils/filterAttributeRules");

const DRY_RUN = process.argv.includes("--dry-run");

const slugify = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

async function connectDB() {
  const mongoUri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/infant_care";
  await mongoose.connect(mongoUri);
  console.log(`✅ Connected to MongoDB: ${mongoUri.substring(0, 50)}...`);
}

async function main() {
  console.log("\n🚀 Backfilling attribute synonyms");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes saved)" : "LIVE"}\n`);

  // Pre-build: canonical slug -> set of all static variant slugs
  const synonymsByCanonical = new Map();
  for (const [code, def] of Object.entries(FILTER_ATTRIBUTE_DEFINITIONS)) {
    const aliases = def?.aliases || {};
    for (const [canonical, variants] of Object.entries(aliases)) {
      const canonicalSlug = normalizeFilterTokenByKey(code, canonical);
      if (!canonicalSlug) continue;
      if (!synonymsByCanonical.has(canonicalSlug)) {
        synonymsByCanonical.set(canonicalSlug, new Set());
      }
      const set = synonymsByCanonical.get(canonicalSlug);
      set.add(slugify(canonical));
      (Array.isArray(variants) ? variants : []).forEach((v) =>
        set.add(slugify(v)),
      );
    }
  }

  const attributes = await AttributeDefinition.find({}).lean();
  let changed = 0;
  let dryChanged = 0;

  for (const attribute of attributes) {
    const code = String(attribute.code || "").toLowerCase().trim();
    let attrChanged = false;

    const updatedValues = (attribute.allowedValues || []).map((av) => {
      const canonicalSlug = normalizeFilterTokenByKey(code, av.value);
      const candidates = synonymsByCanonical.get(canonicalSlug);
      if (!candidates) return av;

      const ownSlug = slugify(av.value);
      const derived = [...candidates].filter(
        (s) => s && s !== ownSlug && s !== canonicalSlug,
      );
      const merged = [
        ...new Set([...(Array.isArray(av.synonyms) ? av.synonyms : []), ...derived]),
      ].sort();

      const existing = Array.isArray(av.synonyms) ? av.synonyms : [];
      if (
        merged.length === existing.length &&
        merged.every((s, i) => s === existing[i])
      ) {
        return av;
      }

      attrChanged = true;
      return { ...av, synonyms: merged };
    });

    if (attrChanged) {
      changed++;
      console.log(`  ${code}: synced ${updatedValues.length} allowed value(s)`);
      if (!DRY_RUN) {
        await AttributeDefinition.updateOne(
          { _id: attribute._id },
          { $set: { allowedValues: updatedValues } },
        );
      } else {
        dryChanged++;
      }
    }
  }

  if (!DRY_RUN) {
    await refreshAttributeAliasLookups();
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary");
  console.log(`Attributes updated: ${DRY_RUN ? dryChanged : changed}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "COMPLETE"}`);

  await mongoose.disconnect();
  console.log("✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
