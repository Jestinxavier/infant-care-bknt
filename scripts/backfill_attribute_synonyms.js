/**
 * Migration Script: Backfill allowedValues[].synonyms from the static alias map
 *
 * Seeds the merchant-managed `synonyms` array on every AttributeDefinition's
 * allowedValues using the bootstrap vocabulary in filterAttributeRules.js plus
 * the durable size training map in catalogAttributeResolver.js (SIZE_SYNONYM_MAP).
 * After this runs, synonyms are fully DB-driven — the static maps are only a
 * fallback for brand-new deployments.
 *
 * Optional: `--add-missing` also CREATES any canonical size allowed values
 * (premature, newborn, letter sizes, free size, dimension sizes, ...) that the
 * training map references but the live Attribute Registry does not have yet.
 * Without that entry the deterministic resolver + AI fixer cannot produce the
 * canonical label, so backfilling synonyms alone is not enough.
 *
 * Usage:
 *   node scripts/backfill_attribute_synonyms.js [--dry-run] [--add-missing]
 *                                            [--uri <mongodb-url>]
 *
 * Flags:
 *   --dry-run       Preview changes without saving to database
 *   --add-missing   Create missing canonical size allowed values (needs the
 *                   size attribute to exist). Shown in dry-run as "would add".
 *   --uri <url>     Override the Mongo connection string. Defaults to
 *                   MONGODB_URI in .env, then mongodb://localhost:27017
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
const {
  SIZE_SYNONYM_MAP,
} = require("../src/utils/catalogAttributeResolver");

const DRY_RUN = process.argv.includes("--dry-run");
const ADD_MISSING = process.argv.includes("--add-missing");
const URI_FLAG = process.argv.indexOf("--uri");
const MONGO_URI_OVERRIDE =
  URI_FLAG !== -1 && process.argv[URI_FLAG + 1]
    ? process.argv[URI_FLAG + 1]
    : null;

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

// Map a SIZE_SYNONYM_MAP canonical filter slug to the DB allowed-value value
// used by the store Attribute Registry (singular "0-3-month", hyphen form).
const sizeTrainingValue = (canonical) => {
  if (canonical === "newborn") return "new-born";
  if (canonical.endsWith("-months")) {
    return canonical.replace(/-months$/, "-month");
  }
  return canonical;
};

// Produce store-compliant labels: "0-3-month" -> "0-3 Month", "new-born" -> "New Born".
const trainingLabel = (value) => {
  if (/^[slm]$/.test(value)) return value.toUpperCase();
  const v = String(value).replace(/(\d+)-(\d+)-month$/i, "$1-$2 Month");
  return v
    .replace(/-/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
};

async function connectDB() {
  const mongoUri =
    MONGO_URI_OVERRIDE ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/infant_care";
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.error(
    "DBG readyState after connect:",
    mongoose.connection.readyState,
    mongoose.connection.host,
  );
  console.log(
    `✅ Connected to MongoDB: ${mongoUri.replace(/\/\/.*@/, "//***@").substring(0, 80)}`,
  );
}

async function main() {
  console.log("\n🚀 Backfilling attribute synonyms");
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no changes saved)" : "LIVE"} | ` +
      `add-missing: ${ADD_MISSING ? "ON" : "OFF"}\n`,
  );

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

  // Merge the durable size training data (premature, dimensional, letter sizes,
  // age-range spellings) so the knowledge base teaches the AI the same
  // vocabulary the deterministic resolver enforces.
  for (const [canonical, variants] of Object.entries(SIZE_SYNONYM_MAP)) {
    const canonicalSlug = normalizeFilterTokenByKey("size", canonical) || slugify(canonical);
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

  const attributes = await AttributeDefinition.find({}).lean();
  console.error("DBG find done rows:", attributes.length);
  let changed = 0;
  let dryChanged = 0;
  let addedCount = 0;
  let dryAddedCount = 0;

  for (const attribute of attributes) {
    const code = String(attribute.code || "").toLowerCase().trim();
    let attrChanged = false;
    let added = [];

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

    // --add-missing: create canonical training values the registry lacks.
    // The size attribute must exist (created via Settings → Product Attributes
    // or a previous seed) before we can add values to it.
    if (ADD_MISSING && code === "size") {
      const existingValues = new Set(
        updatedValues.map((av) => slugify(av.value)),
      );
      for (const [canonical, variants] of Object.entries(SIZE_SYNONYM_MAP)) {
        const dbValue = sizeTrainingValue(canonical);
        if (existingValues.has(slugify(dbValue))) continue;
        const ownSlug = slugify(dbValue);
        const normalizedSynonyms = [
          ...new Set(
            [canonical, ...(Array.isArray(variants) ? variants : [])]
              .map(slugify)
              .filter((s) => s && s !== ownSlug),
          ),
        ].sort();
        updatedValues.push({
          value: dbValue,
          label: trainingLabel(dbValue),
          synonyms: normalizedSynonyms,
          isActive: true,
        });
        existingValues.add(slugify(dbValue));
        added.push(dbValue);
        attrChanged = true;
      }
    }

    if (!attrChanged) continue;

    if (added.length) {
      console.log(
        `  ${code}: would add allowed value(s) -> ${added.join(", ")}`,
      );
    } else {
      console.log(`  ${code}: synced synonyms on ${updatedValues.length} allowed value(s)`);
    }

    if (DRY_RUN) {
      dryChanged++;
      dryAddedCount += added.length;
    } else {
      await AttributeDefinition.updateOne(
        { _id: attribute._id },
        { $set: { allowedValues: updatedValues } },
      );
      changed++;
      addedCount += added.length;
    }
  }

  if (!DRY_RUN) {
    await refreshAttributeAliasLookups();
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary");
  console.log(`Attributes updated: ${DRY_RUN ? dryChanged : changed}`);
  console.log(`Allowed values added: ${DRY_RUN ? dryAddedCount : addedCount}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN — nothing saved" : "COMPLETE"}`);

  // Reminder for anyone who ran this against the live database
  if (!DRY_RUN && (changed > 0 || addedCount > 0)) {
    console.log(
      "\n👉 The running API caches DB synonyms in memory. Restart the API server",
      "(or let its alias-lookup cache refresh) so new synonyms take effect.",
    );
  }

  await mongoose.disconnect();
  console.log("✅ Disconnected from MongoDB");
}

main().catch((error) => {
  console.error("❌ Migration failed:", error);
  if (error.name === "MongooseServerSelectionError") {
    console.error(
      "\nCould not reach MongoDB. Tips:",
      "\n  1. Local dev  → start mongod, or pass:  --uri mongodb://localhost:27017",
      "\n  2. The .env MONGODB_URI points at Atlas — from a laptop, the Atlas IP",
      '    allowlist must include this machine, or run this script on the VPS.',
    );
  }
  process.exit(1);
});
