/**
 * Filter-value cleanup: fix product values that bypass the attribute catalogue
 * and bridge short/long size forms. Three concerns, one idempotent pass:
 *
 *   A. Add short-form synonyms to the Size catalogue so "m"/"s" resolve to
 *      "medium"/"small" (and l→large, sm/md/lg variants). Pure catalogue edit.
 *   B. Rewrite products whose filterAttributes still hold the short forms
 *      (m/s) to the canonical long forms — via rewriteProductReferences, so
 *      variant/option/filter references are all fixed and old codes become
 *      aliases (old filter URLs keep resolving).
 *   C. Remove catalogue-invalid values from filterAttributes (e.g. a material
 *      value that leaked into gender). Surgical $set of the affected key.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/migrate-filter-value-cleanups.js          # dry run
 *   node scripts/migrate-filter-value-cleanups.js --write
 */

const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const { refreshAttributeAliasLookups } = require("../src/utils/filterAttributeRules");
const {
  resolveCatalogValueForAttribute,
} = require("../src/utils/attributeCatalogGuard");

const WRITE = process.argv.includes("--write");

// A. Short form → canonical value (Size only). Only applied when the canonical
//    value exists in the catalogue; missing canonicals are reported and skipped.
const SIZE_SYNONYMS = {
  small: ["s", "sm"],
  medium: ["m", "md"],
  large: ["l", "lg"],
  "extra-large": ["xl"],
  "double-xl": ["xxl"],
};

// B. Short tokens → canonical Size value to rewrite on products.
const SIZE_REWRITES = {
  "medium": ["m"],
  "small": ["s"],
};

// Attribute keys the invalid-value sweep checks (the nine filter keys).
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

function log(msg = "") {
  process.stdout.write(msg + "\n");
}
const rule = () => log("─".repeat(72));

async function addSizeSynonyms() {
  rule();
  log("A. Add short-form Size synonyms");
  rule();

  const size = await AttributeDefinition.findOne({ code: "size" });
  if (!size) {
    log("   ⚠️  no Size attribute found — skipped");
    return;
  }

  let edits = 0;
  for (const [canonical, shorts] of Object.entries(SIZE_SYNONYMS)) {
    const av = size.allowedValues.find((v) => v.value === canonical);
    if (!av) {
      log(`   ⚠️  "${canonical}" not in catalogue — skipped (${shorts.join(", ")})`);
      continue;
    }
    const set = new Set(av.synonyms || []);
    const before = set.size;
    for (const s of shorts) if (s && s !== canonical) set.add(s);
    if (set.size !== before) {
      av.synonyms = Array.from(set);
      edits += 1;
      log(`   + "${canonical}"  synonyms → ${av.synonyms.join(", ")}`);
    } else {
      log(`   = "${canonical}"  already has ${shorts.join(", ")}`);
    }
  }

  if (edits && WRITE) {
    await size.save();
    await refreshAttributeAliasLookups().catch(() => {});
    log(`   ✓ saved (${edits} value(s) updated)`);
  } else if (edits) {
    log(`   (dry run — ${edits} value(s) would be updated)`);
  }
}

async function rewriteShortSizeForms() {
  rule();
  log("B. Re-derive stale Size filterAttributes on configurable products");
  rule();

  // These products carry correct variant values ("small"/"medium") but a stale
  // derived filterAttributes (["s","m"]). Because filterAttributes is derived
  // from the variants on save (syncFilterAttributes), re-saving the product
  // repairs it. For SIMPLE products (no variants), fall back to rewriting the
  // stored short forms via rewriteProductReferences.

  const size = await AttributeDefinition.findOne({ code: "size" });
  if (!size) {
    log("   ⚠️  no Size attribute — skipped");
    return;
  }

  const shortTokens = Object.values(SIZE_REWRITES).flat(); // ["m","s"]
  const affected = await Product.find({
    "filterAttributes.size": { $in: shortTokens },
  }).select("title product_type filterAttributes.size variants variantOptions");

  if (affected.length === 0) {
    log("   = no products hold short Size forms");
    return;
  }

  let saved = 0;
  for (const product of affected) {
    const isConfigurable =
      String(product.product_type || "").toLowerCase() === "configurable";
    const sizeIsOption = (product.variantOptions || []).some(
      (o) => String(o?.code || o?.name || "").toLowerCase() === "size",
    ) || (product.variants || []).some((v) => {
      const attrs = v?.attributes || v?.options;
      const keys = attrs instanceof Map ? [...attrs.keys()] : Object.keys(attrs || {});
      return keys.some((k) => String(k).toLowerCase() === "size");
    });

    log(
      `   • ${String(product.title || product._id).slice(0, 50)} | ` +
        `${isConfigurable && sizeIsOption ? "re-derive from variants" : "rewrite stored tokens"}`,
    );

    if (!WRITE) continue;

    if (isConfigurable && sizeIsOption) {
      // Re-save: Product.pre('save') → syncFilterAttributes re-derives size.
      await product.save();
    } else {
      // SIMPLE / non-dimension: rewrite the raw stored tokens.
      const current = Array.isArray(product.filterAttributes?.size)
        ? product.filterAttributes.size
        : [];
      const next = current
        .map((val) => {
          const entry = Object.entries(SIZE_REWRITES).find(([, shorts]) =>
            shorts.includes(val),
          );
          return entry ? entry[0] : val;
        })
        .filter(Boolean);
      product.filterAttributes.size = [...new Set(next)];
      await product.save();
    }
    saved += 1;
  }

  log(`   ${WRITE ? "Saved" : "Would save"}: ${saved} product(s)`);
}

async function sweepInvalidFilterValues() {
  rule();
  log("C. Remove catalogue-invalid values from product filterAttributes");
  rule();

  const defs = await AttributeDefinition.find({}).lean();
  const catalogMap = new Map();
  for (const d of defs) if (d.code) catalogMap.set(d.code.toLowerCase(), d);

  // Augment the Size definition in-memory with the short-form synonyms from
  // step A, so the sweep agrees with the post-migration catalogue and never
  // drops a value that A/B are about to canonicalise (accuracy in dry run too).
  const sizeDef = catalogMap.get("size");
  if (sizeDef) {
    const cloned = { ...sizeDef, allowedValues: (sizeDef.allowedValues || []).map((v) => ({ ...v, synonyms: [...(v.synonyms || [])] })) };
    for (const [canonical, shorts] of Object.entries(SIZE_SYNONYMS)) {
      const av = cloned.allowedValues.find((v) => v.value === canonical);
      if (av) for (const s of shorts) if (!av.synonyms.includes(s)) av.synonyms.push(s);
    }
    catalogMap.set("size", cloned);
  }

  const products = await Product.find({})
    .select("title filterAttributes")
    .lean();

  let touched = 0;
  for (const product of products) {
    const fa = product.filterAttributes || {};
    let changed = false;
    const next = { ...fa };

    for (const key of FILTER_KEYS) {
      const values = Array.isArray(fa[key]) ? fa[key] : [];
      if (values.length === 0) continue;
      const def = catalogMap.get(key);
      if (!def) continue;
      const kept = values.filter((raw) =>
        resolveCatalogValueForAttribute(def, raw) ? true : false,
      );
      if (kept.length !== values.length) {
        changed = true;
        const dropped = values.filter((v) => !kept.includes(v));
        log(
          `   • ${String(product.title || product._id).slice(0, 50)} | ${key}: dropping ${JSON.stringify(dropped)}`,
        );
        next[key] = kept;
      }
    }

    if (changed) {
      touched += 1;
      if (WRITE) {
        // Only the affected key is $set — never clobber other derived values.
        const sets = {};
        for (const key of FILTER_KEYS) {
          if (next[key] !== fa[key]) sets[`filterAttributes.${key}`] = next[key];
        }
        await Product.updateOne({ _id: product._id }, { $set: sets });
      }
    }
  }

  log(`   ${WRITE ? "Updated" : "Would update"}: ${touched} product(s)`);
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  log(
    `\n${WRITE ? "✍️  Filter-value cleanup (WRITE)" : "🔎 Filter-value cleanup (dry run — pass --write)"}\n`,
  );
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  await refreshAttributeAliasLookups().catch(() => {});

  await addSizeSynonyms();
  await rewriteShortSizeForms();
  await sweepInvalidFilterValues();

  rule();
  log(WRITE ? "✅ Done (writes applied)" : "✅ Done (dry run — nothing written)");
  if (!WRITE) log("   Run with --write to apply.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
