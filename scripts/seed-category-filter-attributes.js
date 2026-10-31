/**
 * Seed the per-category storefront filter allowlist (`Category.filterAttributes`).
 *
 * Shoppers should only see filter groups that make sense for the category they
 * are browsing — a towel has no "sleeve" or "season". The allowlist is enforced
 * in the facet builder (`getFilters.js`); an empty list means "show all
 * applicable groups" so unconfigured categories keep working unchanged.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/seed-category-filter-attributes.js          # dry run
 *   node scripts/seed-category-filter-attributes.js --write
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Category = require("../src/models/Category");
const { cacheDelPattern } = require("../src/utils/redisCache");

const { apply: WRITE } = require("./lib/cliMode").parseMode(process.argv.slice(2), { defaultMode: "dry" });

const GARMENT = [
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

const BOTTOM_WEAR = [
  "color",
  "size",
  "material",
  "season",
  "gender",
  "pattern",
  "pack",
];

const TOWELS = ["color", "size", "material", "pattern", "pack"];
const NON_WEARABLE = ["color", "material", "pattern", "pack"];
const NEW_BORN = ["color", "size", "material", "gender", "pattern", "pack"];
const NEW_BORN_KIT = ["color", "material", "pattern", "pack"];
const DRY_SHEET = ["color", "size"];
const SKIN_ORAL_CARE = ["color"];

// Category code → allowlist. Codes not listed are left untouched.
const PLAN = {
  rompers: GARMENT,
  "sleep-suits": GARMENT,
  "dresses-frocks": GARMENT,
  jhablas: GARMENT,
  "onesies-full-covering": GARMENT,
  "sets-combos": GARMENT,
  "winter-wear": GARMENT,
  "bottom-wear": BOTTOM_WEAR,
  "towels-cloths": TOWELS,
  "diapering-nappies": TOWELS,
  "baby-accessories": NON_WEARABLE,
  "new-born-essentials": NEW_BORN,
  "new-born-kit-hospital-kit": NEW_BORN_KIT,
  "dry-sheet": DRY_SHEET,
  "skin-oral-care": SKIN_ORAL_CARE,
};

function sameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  console.log(
    `\n${WRITE ? "✍️  Seed category filter allowlists (WRITE)" : "🔎 Seed category filter allowlists (dry run — pass --write)"}\n`,
  );

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 30000 });
  console.log(`Database: ${mongoose.connection.name}\n`);

  const codes = Object.keys(PLAN);
  const categories = await Category.find({ code: { $in: codes } });
  const byCode = new Map(categories.map((cat) => [cat.code, cat]));

  let updated = 0;
  let unchanged = 0;

  for (const code of codes) {
    const allowlist = PLAN[code];
    const category = byCode.get(code);

    if (!category) {
      console.log(`⚠️  ${code.padEnd(28)} not found — skipped`);
      continue;
    }

    const current = category.filterAttributes || [];
    const isSame = sameSet(current, allowlist);

    console.log(
      `${isSame ? "✓ " : "→ "}${code.padEnd(28)} [${allowlist.join(", ")}]`,
    );
    if (!isSame && current.length) {
      console.log(`   current: [${current.join(", ")}]`);
    }

    if (isSame) {
      unchanged += 1;
      continue;
    }

    if (WRITE) {
      category.filterAttributes = allowlist;
      await category.save();
    }
    updated += 1;
  }

  console.log(`\n${WRITE ? "Updated" : "Would update"}: ${updated}`);
  console.log(`Already correct: ${unchanged}`);

  if (WRITE && updated > 0) {
    await cacheDelPattern("filters:config:*");
    console.log("Cleared filters:config:* cache");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
