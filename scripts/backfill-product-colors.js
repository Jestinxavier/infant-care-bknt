/**
 * One-off backfill: populate product.filterAttributes.color for products that
 * have a colour only in their title (variants/options carry none). Applies the
 * agreed rule:
 *   - 1 colour in title        → that colour
 *   - 2 colours                → both
 *   - 3+ colours / explicit    → "multicolor"
 *   - no colour discernible    → "others"  (so the product is never omitted)
 *
 * Values are resolved against the REGISTERED Color catalogue (synonyms fold
 * spellings like gray/grey, off white/off-white), so nothing unregistered is
 * ever written. Only products with an EMPTY color are touched; products that
 * already have a color are left untouched.
 *
 * Registers an "others" Color value (idempotent) before use.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/backfill-product-colors.js          # dry run
 *   node scripts/backfill-product-colors.js --write
 *   node scripts/backfill-product-colors.js --report # dump every proposed mapping
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const { refreshAttributeAliasLookups } = require("../src/utils/filterAttributeRules");
const {
  loadAttributeCatalogMap,
  resolveCatalogValueForAttribute,
} = require("../src/utils/attributeCatalogGuard");

const { apply: WRITE } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "dry" });
const REPORT = process.argv.includes("--report");
const ATTR_CODE = "color";

const OTHERS_VALUE = { value: "others", label: "Others", hex: "#d1d5db" };

// Real colours that appear in titles but were never registered. Registering
// them (idempotent) lets these products resolve to a real swatch instead of
// falling through to "others".
const NEW_COLOR_VALUES = [
  { value: "black", label: "Black", hex: "#111827" },
  { value: "maroon", label: "Maroon", hex: "#7f1d1d" },
  { value: "peach", label: "Peach", hex: "#fdba74" },
  { value: "beige", label: "Beige", hex: "#e7d8c9" },
  { value: "cream", label: "Cream", hex: "#fdf6e3" },
];

// Ordered longest-first so multi-word colours ("off white", "light blue") win
// over their single-word parts. Each entry maps a title token to a candidate
// canonical Color value; resolution against the catalogue (with synonyms)
// decides the final stored value.
const COLOR_TOKENS = [
  ["off white", "off-white"],
  ["off-white", "off-white"],
  ["light blue", "sky-blue"],
  ["sky blue", "sky-blue"],
  ["royal blue", "blue"],
  ["dark blue", "blue"],
  ["navy blue", "blue"],
  ["light green", "light-green"],
  ["dark green", "green"],
  ["light pink", "pink"],
  ["dark pink", "pink"],
  ["dusty rose", "pink"],
  ["light rose", "pink"],
  ["rose", "pink"],
  ["violet", "purple"],
  ["grey", "gray"],
  ["gray", "gray"],
  ["white", "white"],
  ["black", "black"],
  ["blue", "blue"],
  ["green", "green"],
  ["red", "red"],
  ["pink", "pink"],
  ["purple", "purple"],
  ["yellow", "yellow"],
  ["orange", "orange"],
  ["brown", "brown"],
  ["maroon", "maroon"],
  ["meroon", "maroon"],
  ["peach", "peach"],
  ["beige", "beige"],
  ["cream", "cream"],
];

// When a broad colour is implied by a more specific one, drop the broad one so
// "off white" doesn't also count as "white" (which would falsely trigger
// multicolor). Keys are the specific value; values are broad values to drop.
const SPECIFIC_SUPPRESSES = {
  "off-white": ["white"],
  "light-green": ["green"],
  "sky-blue": ["blue"],
};

function detectColors(title) {
  const t = ` ${String(title || "").toLowerCase()} `;

  // "Multi", "multicolour", "multicolor", or a "multi"-prefixed design word
  // (Multiflower, Multi Leaf, Multi Design...) in the name → multicolor.
  if (/\bmulticolou?r|\bmulti[\s-]?[a-z]/.test(t)) {
    return ["multicolor"];
  }

  const hits = [];
  for (const [token, candidate] of COLOR_TOKENS) {
    const re = new RegExp(`(^|[^a-z])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    if (re.test(t)) hits.push(candidate);
  }
  let uniq = [...new Set(hits)];
  // Suppress broad colours that a more specific detected colour implies.
  for (const specific of uniq) {
    const drop = SPECIFIC_SUPPRESSES[specific];
    if (drop) uniq = uniq.filter((c) => !drop.includes(c));
  }
  return uniq;
}

function log(msg) {
  console.log(msg);
}
function rule() {
  console.log("─".repeat(72));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  console.log(
    `\n${WRITE ? "✍️  Backfill product colors (WRITE)" : "🔎 Backfill product colors (dry run — pass --write)"}\n`,
  );

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });

  const attribute = await AttributeDefinition.findOne({ code: ATTR_CODE });
  if (!attribute) {
    console.error(`Attribute "${ATTR_CODE}" not found`);
    process.exit(1);
  }

  // 1. Ensure "others" + the missing real colours are registered.
  rule();
  log("0. Register Color values");
  rule();
  const toRegister = [OTHERS_VALUE, ...NEW_COLOR_VALUES].filter(
    (v) => !attribute.allowedValues.some((x) => x.value === v.value),
  );
  if (toRegister.length === 0) {
    log("   = all target values already registered");
  } else {
    for (const v of toRegister) log(`   + "${v.value}" (${v.label}, ${v.hex})`);
    if (WRITE) {
      for (const v of toRegister) {
        attribute.allowedValues.push({ ...v, synonyms: [], isActive: true });
      }
      await attribute.save();
      await refreshAttributeAliasLookups().catch(() => {});
      log("   ✓ saved");
    } else {
      log("   (dry run — would be created)");
    }
  }

  // Build a resolver that treats not-yet-persisted values as available during a
  // dry run (the DB won't have them until --write runs).
  const catalogMap = await loadAttributeCatalogMap();
  const colorDef = catalogMap.get(ATTR_CODE);
  for (const v of [...attribute.allowedValues, ...toRegister]) {
    if (!colorDef.allowedValues.some((x) => x.value === v.value)) {
      colorDef.allowedValues.push({ value: v.value, label: v.label, hex: v.hex });
    }
  }

  const resolveColor = (candidate) => {
    const r = resolveCatalogValueForAttribute(colorDef, candidate);
    return r ? r.value : null;
  };

  // 2. Scan products with empty color.
  rule();
  log("1. Infer Color from title");
  rule();

  const products = await Product.find({
    $or: [
      { [`filterAttributes.${ATTR_CODE}`]: { $size: 0 } },
      { [`filterAttributes.${ATTR_CODE}`]: { $exists: false } },
    ],
  })
    .select("title filterAttributes")
    .lean();

  const buckets = { one: 0, two: 0, multi: 0, others: 0 };
  const unresolved = [];
  let touched = 0;
  const writes = [];

  for (const product of products) {
    const detected = detectColors(product.title);
    // Resolve candidates to registered values (dedupe after resolution).
    const resolved = [...new Set(detected.map(resolveColor).filter(Boolean))];

    let next;
    if (resolved.length === 0) {
      next = [OTHERS_VALUE.value];
      buckets.others += 1;
    } else if (resolved.length === 1) {
      next = resolved;
      buckets.one += 1;
    } else if (resolved.length === 2) {
      next = resolved;
      buckets.two += 1;
    } else {
      next = ["multicolor"];
      buckets.multi += 1;
    }

    // Anything detected but not resolvable (never invent) — record for review.
    if (detected.length && resolved.length !== detected.length && !REPORT) {
      const dropped = detected.filter((c) => !resolveColor(c));
      if (dropped.length) unresolved.push({ title: product.title, dropped });
    }

    if (REPORT) {
      log(
        `   ${String(product.title || "").slice(0, 60).padEnd(62)} → ${JSON.stringify(next)}` +
          (detected.length ? `  (detected: ${detected.join(",")})` : ""),
      );
    }

    touched += 1;
    writes.push({ _id: product._id, value: next });
  }

  // 3. Apply.
  rule();
  log("2. Summary");
  rule();
  log(`   Products scanned (empty color): ${products.length}`);
  log(`   • 1 colour:   ${buckets.one}`);
  log(`   • 2 colours:  ${buckets.two}`);
  log(`   • 3+/multi:   ${buckets.multi}`);
  log(`   • others:     ${buckets.others}`);

  if (WRITE) {
    // Bulk-write in chunks.
    const CHUNK = 500;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const ops = writes.slice(i, i + CHUNK).map((w) => ({
        updateOne: {
          filter: { _id: w._id },
          update: { $set: { [`filterAttributes.${ATTR_CODE}`]: w.value } },
        },
      }));
      await Product.bulkWrite(ops, { ordered: false });
    }
    log(`\n   ✓ Updated ${touched} product(s)`);
  } else {
    log("\n   Dry run — nothing written. Run with --write to apply.");
  }

  if (unresolved.length) {
    log(`\n   ⚠️  ${unresolved.length} product(s) had detected tokens that didn't resolve (left as-is for that token):`);
    for (const u of unresolved.slice(0, 20)) log(`      ${u.title} → dropped ${JSON.stringify(u.dropped)}`);
  }

  await mongoose.disconnect();
  console.log("\n✅ Done");
}

main().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});
