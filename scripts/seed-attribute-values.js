/**
 * Self-healing seed for the global product-attribute registry.
 *
 * Ensures the `size` and `color` attribute definitions exist, are visible
 * (and not duplicated) in Settings → Product Attributes, and carry a clean,
 * canonical value list:
 *
 *   1. CREATE missing definitions. Reuses the `_id` already referenced by
 *      existing products' `variantOptions[].attributeId` so the dashboard's
 *      attribute-based label resolution keeps working (ids are the join key).
 *   2. FIX `role` → "variant" when missing/empty. "variant" puts each
 *      attribute in exactly ONE Settings section (Variant Options); "both"
 *      made every card render twice (Variant Options AND Metadata), which
 *      read as "duplicate attributes".
 *   3. SEED clean values when the definition has none, and FOLD near-duplicate
 *      slug variants (e.g. "0-6", "0-6m", "3-6-m") into their canonical token
 *      ("0-6-months") as SYNONYMS instead of separate rows.
 *   4. RELABEL auto-seeded values so numeric ranges keep their hyphen
 *      ("0-3-months" → "0-3 Months", never "0 3 Months"). Merchants' own
 *      custom labels are preserved.
 *   5. SYNC usageCount from actual product references so the delete guard
 *      stays meaningful.
 *
 * Synonyms answer the registry's core job: allow free-form product values
 * (as many spellings as the catalog has used) to collapse into ONE canonical
 * value, instead of each spelling becoming its own option.
 *
 * Usage (run from `backend/`):
 *   node scripts/seed-attribute-values.js --dry-run  (preview — no writes)
 *   node scripts/seed-attribute-values.js             (live)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Attribute = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");

const IS_DRY_RUN = process.argv.includes("--dry-run");
const log = (msg) => process.stdout.write(msg + "\n");

const DEFINITIONS = [
  { code: "size", label: "Size", role: "variant", type: "enum", uiType: "chips", position: 1 },
  { code: "color", label: "Color", role: "variant", type: "enum", uiType: "swatch", position: 0 },
];

// Near-duplicate slug forms → canonical value. Each canonical carries the
// variant forms as `synonyms` so product data using any form still resolves.
const FOLD_ALIASES = {
  size: {
    "0-3-months": ["0-3m", "0-3-month"],
    "3-6-months": ["3-6-m", "3-6m"],
    "0-6-months": ["0-6", "0-6m"],
    "6-12-months": ["6-12", "6-12m"],
    "0-12-months": ["0-12m"],
  },
};
const FOLD_TO_CANONICAL = Object.fromEntries(
  Object.entries(FOLD_ALIASES).map(([code, map]) => {
    const rev = {};
    for (const [canon, aliases] of Object.entries(map)) {
      for (const alias of aliases) rev[alias] = canon;
    }
    return [code, rev];
  }),
);

// Skip dimension-like ("110x120cm") and over-composite tokens
// ("white-ight-dark-blue-dot") so only clean, variant-worthy values are seeded.
const isCleanToken = (value) => {
  if (/cm|inch|"|'|\*|x\s*\d/.test(value)) return false;
  if (String(value).split("-").length > 3) return false;
  return true;
};

// Display label. Numeric range slugs keep a spaced hyphen ("0-3-months" →
// "0 - 3 Months"), word slugs use spaces ("free-size" → "Free Size").
const humanizeLabel = (slug, dash = " - ") =>
  String(slug)
    .split("-")
    .reduce((acc, part, i, arr) => {
      const prev = arr[i - 1];
      const keepDash = prev !== undefined && /\d$/.test(prev) && /^\d/.test(part);
      const word = part.charAt(0).toUpperCase() + part.slice(1);
      return acc + (i === 0 ? "" : keepDash ? dash : " ") + word;
    }, "");

// Compact form WITHOUT spacing ("0-3 Months"). Only used to detect auto-seeded
// labels that still carry the old compact hyphen so they can be re-labeled.
const compactLabel = (slug) => humanizeLabel(slug, "-");

// Legacy auto-label format ("0 3 Months") — used only to detect untouched
// auto-seeded labels so we can re-label them without clobbering edits.
const legacyHumanizeLabel = (slug) =>
  String(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

// Real hex for the common canonical color tokens. Values without an entry
// stay hex-less (dashboard renders a neutral "no color" swatch).
const COLOR_HEX = {
  black: "#111827",
  blue: "#3b82f6",
  brown: "#92400e",
  gray: "#9ca3af",
  green: "#22c55e",
  "light-green": "#86efac",
  multicolor: "__multicolor__",
  orange: "#f97316",
  pink: "#f472b6",
  purple: "#a855f7",
  red: "#ef4444",
  "sky-blue": "#38bdf8",
  white: "#ffffff",
  yellow: "#eab308",
};

const withColorHex = (rows) =>
  rows.map((row) => ({
    ...row,
    hex: row.hex ?? COLOR_HEX[row.value],
  }));

function buildCleanValues(rawSlugs, code) {
  const fold = FOLD_TO_CANONICAL[code] || {};
  const canonical = new Map(); // canonical token -> Set of seen aliases
  for (const raw of rawSlugs) {
    const token = fold[raw] || raw;
    if (!canonical.has(token)) canonical.set(token, new Set());
    if (fold[raw] && raw !== token) canonical.get(token).add(raw);
  }
  return [...canonical.entries()]
    .map(([value, aliases]) => ({
      value,
      label: humanizeLabel(value),
      synonyms: [...aliases].sort(),
      isActive: true,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in environment variables");

  log(IS_DRY_RUN ? "🔍 DRY RUN — no writes will be made\n" : "🛠  Live — documents will be created/updated\n");
  log("🔌 Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  log("✅ Connected\n");

  // Referenced attribute ids and per-code reference counts (usageCount source).
  const refs = await Product.aggregate([
    { $match: { "variantOptions": { $exists: true, $ne: [] } } },
    { $unwind: "$variantOptions" },
    {
      $group: {
        _id: { code: "$variantOptions.code", attributeId: "$variantOptions.attributeId" },
        count: { $sum: 1 },
      },
    },
  ]).allowDiskUse(true);
  const refByCode = new Map();
  for (const r of refs) {
    const code = String(r._id.code || "").toLowerCase();
    if (!code || !r._id.attributeId) continue;
    const prev = refByCode.get(code);
    refByCode.set(code, { id: r._id.attributeId, count: (prev?.count ?? 0) + r.count });
  }

  // Union of clean filter-attribute slugs per code, for value derivation.
  const products = await Product.find({}).select("filterAttributes").lean();
  const slugsByCode = new Map();
  for (const code of DEFINITIONS.map((d) => d.code)) {
    const slugs = new Set();
    for (const p of products) {
      const stored = p.filterAttributes?.[code];
      if (!Array.isArray(stored)) continue;
      for (const raw of stored) {
        const value = String(raw).trim();
        if (value && isCleanToken(value)) slugs.add(value);
      }
    }
    slugsByCode.set(code, slugs);
  }

  const created = [];
  const rolesFixed = [];
  const seeded = [];
  const relabeled = [];
  const folded = [];

  for (const def of DEFINITIONS) {
    const existing = await Attribute.findOne({ code: def.code });

    if (!existing) {
      const ref = refByCode.get(def.code);
      const _id = ref?.id ?? new mongoose.Types.ObjectId();
      const allowedValues = withColorHex(
        buildCleanValues(slugsByCode.get(def.code) ?? [], def.code),
      );

      if (IS_DRY_RUN) {
        log(`⚠️  [${def.code}] definition MISSING — would create (${allowedValues.length} values)`);
        continue;
      }
      await Attribute.create({
        _id,
        code: def.code,
        label: def.label,
        role: def.role,
        type: def.type,
        uiType: def.uiType,
        isRequired: false,
        position: def.position,
        usageCount: ref?.count ?? 0,
        allowedValues,
      });
      log(`✅ [${def.code}] created _id=${_id} role=${def.role} values=${allowedValues.length}`);
      created.push(def.code);
      continue;
    }

    // Normalize role to the canonical one. A missing role hides the attribute
    // from Settings entirely; "both" renders the same card in BOTH sections
    // (Variant Options + Metadata), which reads as duplicate attributes.
    if (existing.role !== def.role) {
      if (!IS_DRY_RUN) {
        await Attribute.updateOne({ _id: existing._id }, { $set: { role: def.role } });
        log(`✅ [${def.code}] role=${JSON.stringify(existing.role)} → ${def.role}`);
      } else if (!existing.role) {
        log(`⚠️  [${def.code}] role missing — would set to ${def.role}`);
      } else if (existing.role === "both") {
        log(`⚠️  [${def.code}] role "both" duplicates cards in Settings — would set to ${def.role}`);
      }
      rolesFixed.push(def.code);
    }

    const values = existing.allowedValues ?? [];

    if (values.length === 0) {
      const allowedValues = withColorHex(
        buildCleanValues(slugsByCode.get(def.code) ?? [], def.code),
      );
      if (IS_DRY_RUN) {
        log(`⚠️  [${def.code}] would seed ${allowedValues.length} value(s)`);
        continue;
      }
      await Attribute.updateOne(
        {
          _id: existing._id,
          $or: [{ allowedValues: { $size: 0 } }, { allowedValues: { $exists: false } }],
        },
        { $set: { allowedValues } },
      );
      log(`✅ [${def.code}] seeded ${allowedValues.length} value(s)`);
      seeded.push(def.code);
      continue;
    }

    // Values exist — refresh stale auto-labels, drop short forms, and ensure
    // their canonical targets carry the variants as synonyms.
    const fold = FOLD_ALIASES[def.code] || {};
    const toCanonical = FOLD_TO_CANONICAL[def.code] || {};
    const rows = new Map(); // value -> working row (synonyms as a Set)
    let foldedHere = 0;

    for (const v of values) {
      const target = toCanonical[v.value];
      if (target && target !== v.value) {
        // Raw short-form slug → folded into its canonical value below.
        foldedHere += 1;
        continue;
      }
      rows.set(v.value, {
        value: v.value,
        label: v.label,
        hex: v.hex,
        synonyms: new Set(v.synonyms ?? []),
        isActive: v.isActive,
      });
    }

    // Ensure every canonical target exists (even if never seeded before).
    for (const canon of Object.keys(fold)) {
      if (!rows.has(canon)) {
        rows.set(canon, {
          value: canon,
          label: humanizeLabel(canon),
          hex: undefined,
          synonyms: new Set(),
          isActive: true,
        });
      }
    }

    // Attach alias forms that aren't their own row as synonyms of the target.
    for (const [canon, aliases] of Object.entries(fold)) {
      const row = rows.get(canon);
      if (!row) continue;
      for (const alias of aliases) {
        if (!rows.has(alias)) row.synonyms.add(alias);
      }
    }

    const nextValues = withColorHex(
      [...rows.values()]
        .map((row) => {
          const want =
            legacyHumanizeLabel(row.value) === row.label ||
            compactLabel(row.value) === row.label
              ? humanizeLabel(row.value)
              : row.label;
          if (want !== row.label) relabeled.push(`${def.code}/${row.value}`);
          return {
            ...row,
            label: want,
            synonyms: [...row.synonyms].sort(),
          };
        })
        .sort((a, b) => a.value.localeCompare(b.value)),
    );

    if (IS_DRY_RUN) {
      if (foldedHere > 0) log(`⚠️  [${def.code}] would fold ${foldedHere} short-form value(s) into synonyms`);
      nextValues.forEach((v) => {
        const prev = values.find((x) => x.value === v.value);
        if (prev && prev.label !== v.label) {
          log(`⚠️  [${def.code}] would relabel "${v.value}": "${prev.label}" → "${v.label}"`);
        }
        const prevSyn = (prev?.synonyms ?? []).join(",");
        if (prevSyn !== v.synonyms.join(",")) {
          log(`⚠️  [${def.code}] synonyms for "${v.value}": ${v.synonyms.join(", ") || "(none)"}`);
        }
      });
      continue;
    }

    await Attribute.updateOne({ _id: existing._id }, { $set: { allowedValues: nextValues } });
    if (foldedHere > 0) folded.push(`${def.code} (-${foldedHere})`);
    if (nextValues.some((v, i) => v.label !== values[i]?.label)) log(`✅ [${def.code}] labels + synonyms refreshed`);
  }

  // Sync usageCount from actual product references.
  if (!IS_DRY_RUN) {
    for (const def of DEFINITIONS) {
      const doc = await Attribute.findOne({ code: def.code });
      if (!doc) continue;
      const wanted = refByCode.get(def.code)?.count ?? 0;
      if (doc.usageCount !== wanted) {
        await Attribute.updateOne({ _id: doc._id }, { $set: { usageCount: wanted } });
        log(`ℹ️  [${def.code}] usageCount ${doc.usageCount} → ${wanted}`);
      }
    }
  }

  await mongoose.disconnect();

  log(IS_DRY_RUN ? "\n── DRY RUN SUMMARY ──" : "\n── RESULT ──");
  log(`   Created definitions : ${created.join(", ") || "none"}`);
  log(`   Roles fixed         : ${rolesFixed.join(", ") || "none"}`);
  log(`   Value lists seeded  : ${seeded.join(", ") || "none"}`);
  log(`   Short forms folded  : ${folded.join(", ") || "none"}`);
  log(`   Labels relabeled    : ${relabeled.length}`);
  if (IS_DRY_RUN) log("   No writes were made.");
  log("\n🎯 Re-run without --dry-run to apply.");
};

run().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});