/**
 * One-off catalogue cleanup: the Color attribute had 7 junk values that are
 * really print/pattern names or — in one case — a size. They each sit on a
 * single SIMPLE product's filterAttributes.color and are referenced nowhere
 * else (no variant/option references).
 *
 * Rule applied (user-confirmed):
 *   - print/pattern words (star/heart/dot/stripe/print) never belong in Color
 *   - 1–2 real colours  → those colours (e.g. white+grey → white, gray)
 *   - 3+ / explicit multicolour → "multicolor"
 *   - a size token ("30x30cm") is moved from Color to Size
 *
 * Also registers "off-white" as a real Color value (it already existed as an
 * alias) so the off-white product maps to a registered value.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/migrate-color-print-values.js          # dry run
 *   node scripts/migrate-color-print-values.js --write
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const { refreshAttributeAliasLookups } = require("../src/utils/filterAttributeRules");
const { toValueToken } = require("../src/utils/attributeValuePolicy");

const WRITE = process.argv.includes("--write");
const ATTR_CODE = "color";

// New Color value to register before rewriting.
const NEW_COLOR_VALUE = { value: "off-white", label: "Off White", hex: "#f5f5f0" };

// Junk Color value → the real Color values it should become.
// An empty target list means "remove from Color" (the size case).
const PLAN = {
  "white-grey-star": { colors: ["white", "gray"] },
  "white-ight-dark-blue-dot": { colors: ["white", "blue"] },
  "pink-stripe-heart-print": { colors: ["pink"] },
  "pink-small-red-heart": { colors: ["pink", "red"] },
  "off-white-pink-star": { colors: ["off-white", "pink"] },
  "light-blue-multicolour-heart": { colors: ["multicolor"] },
  // Not a colour at all — remove from Color and move to Size.
  "30x30cm": { colors: [], size: ["30x30cm"] },
};

function log(msg) {
  console.log(msg);
}
function rule() {
  console.log("─".repeat(72));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  console.log(
    `\n${WRITE ? "✍️  Clean Color print-name values (WRITE)" : "🔎 Clean Color print-name values (dry run — pass --write)"}\n`,
  );

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  const attribute = await AttributeDefinition.findOne({ code: ATTR_CODE });
  if (!attribute) {
    console.error(`Attribute "${ATTR_CODE}" not found`);
    process.exit(1);
  }

  // 1. Ensure "off-white" is a registered Color value.
  const registered = new Set(attribute.allowedValues.map((v) => v.value));
  const needOffWhite = Object.values(PLAN).some((p) =>
    p.colors.includes(NEW_COLOR_VALUE.value),
  );
  const missingTargets = new Set();
  for (const { colors } of Object.values(PLAN)) {
    for (const c of colors) if (!registered.has(c) && c !== NEW_COLOR_VALUE.value) missingTargets.add(c);
  }
  if (missingTargets.size) {
    console.error(
      `❌ Plan references unregistered Color value(s): ${[...missingTargets].join(", ")}`,
    );
    process.exit(1);
  }

  rule();
  log("0. Register Color value");
  rule();
  if (needOffWhite && !registered.has(NEW_COLOR_VALUE.value)) {
    log(`   + "${NEW_COLOR_VALUE.value}" (${NEW_COLOR_VALUE.label}, ${NEW_COLOR_VALUE.hex})`);
    if (WRITE) {
      attribute.allowedValues.push({ ...NEW_COLOR_VALUE, synonyms: [], isActive: true });
      await attribute.save();
      await refreshAttributeAliasLookups().catch(() => {});
      log("   ✓ saved");
    } else {
      log("   (dry run — would be created)");
    }
  } else {
    log(`   = "${NEW_COLOR_VALUE.value}" already registered`);
  }

  // 2. Rewrite the affected products.
  rule();
  log("1. Remap junk Color values on products");
  rule();

  let touched = 0;
  for (const [junk, { colors, size }] of Object.entries(PLAN)) {
    const products = await Product.find({ [`filterAttributes.${ATTR_CODE}`]: junk })
      .select("title filterAttributes")
      .lean();
    if (products.length === 0) {
      log(`   = "${junk}" — no products (already clean)`);
      continue;
    }
    for (const product of products) {
      const current = Array.isArray(product.filterAttributes?.[ATTR_CODE])
        ? product.filterAttributes[ATTR_CODE]
        : [];
      // Drop the junk token, add the real colours (dedup, keep order).
      const next = [];
      for (const v of current) {
        if (v === junk) continue;
        if (!next.includes(v)) next.push(v);
      }
      for (const c of colors) if (!next.includes(c)) next.push(c);

      const sets = { [`filterAttributes.${ATTR_CODE}`]: next };
      if (size) sets["filterAttributes.size"] = size;

      log(
        `   • ${String(product.title || product._id).slice(0, 55)}`,
      );
      log(
        `       color: ${JSON.stringify(current)} → ${JSON.stringify(next)}` +
          (size ? `  |  size → ${JSON.stringify(size)}` : ""),
      );
      touched += 1;

      if (WRITE) {
        await Product.updateOne({ _id: product._id }, { $set: sets });
      }
    }
  }

  // 3. Remove the junk values from the Color catalogue.
  rule();
  log("2. Remove junk values from Color catalogue");
  rule();
  const junkTokens = new Set(Object.keys(PLAN).map((k) => toValueToken(k)));
  const removable = attribute.allowedValues.filter((v) => junkTokens.has(v.value));
  for (const v of removable) log(`   − "${v.value}"  (${v.label})`);
  if (removable.length === 0) {
    log("   = none present (already clean)");
  } else if (WRITE) {
    attribute.allowedValues = attribute.allowedValues.filter(
      (v) => !junkTokens.has(v.value),
    );
    await attribute.save();
    await refreshAttributeAliasLookups().catch(() => {});
    log("   ✓ saved");
  } else {
    log("   (dry run — would be removed)");
  }

  rule();
  if (WRITE) {
    log(`✅ Done — ${touched} product(s) remapped, ${removable.length} value(s) removed`);
  } else {
    log("✅ Done (dry run — nothing written)");
    log("   Run with --write to apply.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});
