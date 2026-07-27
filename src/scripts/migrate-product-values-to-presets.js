/**
 * Migration: Normalize existing product values to match AttributeDefinition presets.
 *
 * Two separate modes for safety:
 *
 *   --filter   Normalize filterAttributes only (color, size, material, etc.)
 *   --variant  Normalize variantOptions values + rebuild uiMeta.color + recalc usageCount
 *
 * Each mode supports --dry-run and --apply:
 *
 *   node src/scripts/migrate-product-values-to-presets.js --filter --dry-run
 *   node src/scripts/migrate-product-values-to-presets.js --filter --apply
 *   node src/scripts/migrate-product-values-to-presets.js --variant --dry-run
 *   node src/scripts/migrate-product-values-to-presets.js --variant --apply
 *
 * Recommended order:
 *   1. --filter --dry-run   → review what filter attrs will change
 *   2. --filter --apply     → apply filter attr changes
 *   3. --variant --dry-run  → review what variant values will change
 *   4. --variant --apply    → apply variant value changes
 */

require("dotenv").config();
const mongoose = require("mongoose");
const AttributeDefinition = require("../models/AttributeDefinition");
const Product = require("../models/Product");
const { FILTER_ATTRIBUTE_DEFINITIONS } = require("../utils/filterAttributeRules");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeTokenToSlug = (value) => {
  let slug = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Normalize dimension sizes: "80 x 80 cm", "80x80-cm", "25x30 inches", "25x30-inches", "25x30" → "25x30inches"
  const dimMatch = slug.match(/^(\d+)\s*x\s*(\d+)\s*-?\s*(cm|mm|m|inches|inch|in)?$/);
  if (dimMatch) {
    let unit = dimMatch[3] || "inches";
    if (unit === "in" || unit === "inch") unit = "inches";
    return `${dimMatch[1]}x${dimMatch[2]}${unit}`;
  }

  slug = slug
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return slug;
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const normalizeHex = (v) => {
  const raw = String(v ?? "").trim();
  return HEX_COLOR_REGEX.test(raw) ? raw.toLowerCase() : null;
};

function buildAllowedValueLookup(attrDef, aliasMap) {
  const lookup = new Map();
  for (const av of (attrDef.allowedValues || []).filter((v) => v.isActive !== false)) {
    const slug = normalizeTokenToSlug(av.value);
    if (slug) lookup.set(slug, { value: av.value, label: av.label, hex: av.hex || null });
  }
  if (aliasMap) {
    for (const [canonicalSlug, aliases] of Object.entries(aliasMap)) {
      // Find any existing entry in this equivalence class (canonical or any alias)
      let canonical = lookup.get(canonicalSlug);
      if (!canonical) {
        for (const alias of aliases) {
          canonical = lookup.get(normalizeTokenToSlug(alias));
          if (canonical) break;
        }
      }
      if (!canonical) continue;
      // Map canonical + all aliases to this entry
      if (!lookup.has(canonicalSlug)) lookup.set(canonicalSlug, canonical);
      for (const alias of aliases) {
        const aliasSlug = normalizeTokenToSlug(alias);
        if (aliasSlug && !lookup.has(aliasSlug)) lookup.set(aliasSlug, canonical);
      }
    }
  }
  return lookup;
}

function matchValue(rawValue, lookup) {
  const slug = normalizeTokenToSlug(rawValue);
  if (!slug) return null;
  return lookup.get(slug) || null;
}

// ---------------------------------------------------------------------------
// Alias maps — reuse from filterAttributeRules.js (single source of truth)
// ---------------------------------------------------------------------------

const VARIANT_OPTION_ALIASES = {};
for (const [key, def] of Object.entries(FILTER_ATTRIBUTE_DEFINITIONS)) {
  if (def.aliases) {
    VARIANT_OPTION_ALIASES[key] = def.aliases;
  }
}

// ---------------------------------------------------------------------------
// Common color hex codes (fallback for new values without hex)
// ---------------------------------------------------------------------------

const COLOR_HEX_MAP = {
  "black": "#000000",
  "white": "#ffffff",
  "red": "#ff0000",
  "blue": "#0000ff",
  "green": "#008000",
  "yellow": "#ffff00",
  "orange": "#ffa500",
  "purple": "#800080",
  "pink": "#ffc0cb",
  "brown": "#a52a2a",
  "gray": "#808080",
  "grey": "#808080",
  "navy": "#000080",
  "beige": "#f5f5dc",
  "maroon": "#800000",
  "olive": "#808000",
  "teal": "#008080",
  "cyan": "#00ffff",
  "magenta": "#ff00ff",
  "lavender": "#e6e6fa",
  "ivory": "#fffff0",
  "coral": "#ff7f50",
  "salmon": "#fa8072",
  "turquoise": "#40e0d0",
  "gold": "#ffd700",
  "silver": "#c0c0c0",
  "cream": "#fffdd0",
  "peach": "#ffcba4",
  "mint": "#98ff98",
  "chocolate": "#d2691e",
  "charcoal": "#36454f",
  "mustard": "#ffdb58",
  "mauve": "#e0b0ff",
  "lilac": "#c8a2c8",
  "tan": "#d2b48c",
  "camel": "#c19a6b",
  "wine": "#722f37",
  "burgundy": "#800020",
  "rust": "#b7410e",
  "rust-orange": "#b7410e",
  "neon-green": "#39ff14",
  "neon-pink": "#ff6ec7",
  "sky-blue": "#87ceeb",
  "baby-blue": "#89cff0",
  "baby-pink": "#f4c2c2",
  "light-blue": "#add8e6",
  "light-green": "#90ee90",
  "light-pink": "#ffb6c1",
  "dark-blue": "#00008b",
  "dark-green": "#006400",
  "dark-grey": "#a9a9a9",
  "dark-gray": "#a9a9a9",
  "off-white": "#fafafa",
  "multi-color": "#ff6600",
  "multicolor": "#ff6600",
  "mixed": "#ff6600",
};

function capitalizeLabel(slug) {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Attribute code → human label (for creating missing AttributeDefinitions)
// ---------------------------------------------------------------------------

const ATTRIBUTE_LABELS = {
  color: "Color",
  size: "Size",
  material: "Material",
  season: "Season",
  gender: "Gender",
  sleeve: "Sleeve",
  occasion: "Occasion",
  pattern: "Pattern",
  pack: "Pack",
};

async function ensureAttributeDefinition(attrByCode, code, dryRun) {
  if (attrByCode.has(code)) return attrByCode.get(code);

  const label = ATTRIBUTE_LABELS[code] || capitalizeLabel(code);
  console.log(`\n  ⚠ AttributeDefinition "${code}" does not exist — creating it`);

  if (!dryRun) {
    const doc = await AttributeDefinition.create({
      code,
      label,
      type: "enum",
      uiType: "chips",
      role: "metadata",
      allowedValues: [],
    });
    attrByCode.set(code, doc);
    return doc;
  }

  // Dry run: return a stub so the caller can log new values
  const stub = { _id: "(dry-run)", code, label, allowedValues: [] };
  attrByCode.set(code, stub);
  return stub;
}

// ---------------------------------------------------------------------------
// Filter Attributes Migration
// ---------------------------------------------------------------------------

async function migrateFilterAttributes(dryRun, allProducts, lookups, attrByCode) {
  console.log("━".repeat(60));
  console.log("  MODE: --filter  (normalize filterAttributes + populate presets)");
  console.log("━".repeat(60) + "\n");

  const stats = {
    productsUpdated: 0,
    productsSkipped: 0,
    totalRemapped: 0,
    remappedDetails: [],
    unmatchedValues: [],
  };

  const unmatchedByCode = new Map(); // key → Set of slug values not in any preset

  for (const product of allProducts) {
    const filterAttrs = product.filterAttributes || {};
    const normalizedFilter = {};
    let changed = false;
    const changes = [];

    for (const [key, values] of Object.entries(filterAttrs)) {
      if (!Array.isArray(values)) continue;
      const lookup = lookups.get(key);
      const normalized = [];

      for (const raw of values) {
        if (lookup) {
          const match = matchValue(raw, lookup);
          if (match) {
            if (raw !== match.value) {
              changed = true;
              stats.totalRemapped++;
              stats.remappedDetails.push({ sku: product.sku, key, from: raw, to: match.value });
              changes.push(`  ${key}: "${raw}" → "${match.value}"`);
            }
            normalized.push(match.value);
            continue;
          }
        }
        const slug = normalizeTokenToSlug(raw);
        if (slug) {
          if (raw !== slug) {
            changed = true;
            stats.totalRemapped++;
            stats.remappedDetails.push({ sku: product.sku, key, from: raw, to: slug });
            changes.push(`  ${key}: "${raw}" → "${slug}"`);
          }
          normalized.push(slug);
          // Track as unmatched (no preset match)
          if (!unmatchedByCode.has(key)) unmatchedByCode.set(key, new Set());
          unmatchedByCode.get(key).add(slug);
        }
      }
      normalizedFilter[key] = [...new Set(normalized)];
    }

    // For CONFIGURABLE products: re-derive color/size from variants
    if ((product.product_type || "").toUpperCase() === "CONFIGURABLE") {
      const colorSet = new Set();
      const sizeSet = new Set();

      for (const variant of (product.variants || [])) {
        const attrs = variant.attributes || variant.options || {};
        const rawColor = typeof attrs.get === "function" ? attrs.get("color") : attrs.color;
        const rawSize = (typeof attrs.get === "function" ? attrs.get("size") : attrs.size)
          || (typeof attrs.get === "function" ? attrs.get("age") : attrs.age);

        if (rawColor) {
          const match = matchValue(rawColor, lookups.get("color") || new Map());
          if (match) {
            colorSet.add(match.value);
          } else {
            const slug = normalizeTokenToSlug(rawColor);
            if (slug) {
              colorSet.add(slug);
              if (!unmatchedByCode.has("color")) unmatchedByCode.set("color", new Set());
              unmatchedByCode.get("color").add(slug);
            }
          }
        }
        if (rawSize) {
          const match = matchValue(rawSize, lookups.get("size") || new Map());
          if (match) {
            sizeSet.add(match.value);
          } else {
            const slug = normalizeTokenToSlug(rawSize);
            if (slug) {
              sizeSet.add(slug);
              if (!unmatchedByCode.has("size")) unmatchedByCode.set("size", new Set());
              unmatchedByCode.get("size").add(slug);
            }
          }
        }
      }

      const newColor = [...colorSet].filter(Boolean);
      const newSize = [...sizeSet].filter(Boolean);

      if (JSON.stringify(normalizedFilter.color) !== JSON.stringify(newColor)) {
        changed = true;
        changes.push(`  color: [re-derived from variants] → [${newColor.join(", ")}]`);
      }
      if (JSON.stringify(normalizedFilter.size) !== JSON.stringify(newSize)) {
        changed = true;
        changes.push(`  size: [re-derived from variants] → [${newSize.join(", ")}]`);
      }
      normalizedFilter.color = newColor;
      normalizedFilter.size = newSize;
    }

    if (changed) {
      stats.productsUpdated++;
      console.log(`[${product.sku || product._id}] ${product.name || "Unnamed"}`);
      changes.forEach((c) => console.log(c));

      if (!dryRun) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { filterAttributes: normalizedFilter } }
        );
      }
    } else {
      stats.productsSkipped++;
    }
  }

  // Add unmatched values as new allowed values to AttributeDefinitions
  if (unmatchedByCode.size > 0) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`New allowed values to add to AttributeDefinitions:`);
    console.log(`${"─".repeat(60)}`);

    for (const [code, slugSet] of unmatchedByCode.entries()) {
      const attrDef = await ensureAttributeDefinition(attrByCode, code, dryRun);

      const existingSlugs = new Set(
        (attrDef.allowedValues || []).map((v) => normalizeTokenToSlug(v.value))
      );
      const newValues = [...slugSet]
        .filter((slug) => !existingSlugs.has(slug))
        .map((slug) => ({
          value: slug,
          label: capitalizeLabel(slug),
          hex: code === "color" ? COLOR_HEX_MAP[slug] || undefined : undefined,
          isActive: true,
        }));

      if (newValues.length === 0) continue;

      console.log(`\n  ${code} (${attrDef.label}): +${newValues.length} new values`);
      for (const nv of newValues) console.log(`    + ${nv.value} (${nv.label})`);
      stats.unmatchedValues.push(...newValues.map((v) => ({ code, ...v })));

      if (!dryRun) {
        await AttributeDefinition.updateOne(
          { _id: attrDef._id },
          { $push: { allowedValues: { $each: newValues } } }
        );
      }
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Variant Options Migration
// ---------------------------------------------------------------------------

async function migrateVariantOptions(dryRun, allProducts, lookups, attrByCode, attrFilter) {
  console.log("━".repeat(60));
  const scope = attrFilter ? `--variant --attr ${attrFilter}` : "--variant (all attributes)";
  console.log(`  MODE: ${scope}`);
  console.log("━".repeat(60) + "\n");

  const stats = {
    productsUpdated: 0,
    productsSkipped: 0,
    valuesRemapped: 0,
    newAllowedValues: 0,
    uiMetaChanged: 0,
    unmatchedValues: [],
    remappedValues: [],
  };

  const attrUpdates = new Map();

  for (const product of allProducts) {
    let changed = false;
    const changes = [];

    if (!Array.isArray(product.variantOptions) || product.variantOptions.length === 0) {
      stats.productsSkipped++;
      continue;
    }

    for (const option of product.variantOptions) {
      const code = (option.code || "").toLowerCase();
      if (attrFilter && code !== attrFilter.toLowerCase()) continue;
      const lookup = lookups.get(code);
      if (!lookup) continue;

      const attrDef = await ensureAttributeDefinition(attrByCode, code, dryRun);

      const valueRemap = new Map();

      for (const val of (option.values || [])) {
        const rawValue = val.value || "";
        const match = matchValue(rawValue, lookup);

        if (match) {
          if (val.value !== match.value || val.label !== match.label) {
            valueRemap.set(rawValue, match.value);
            stats.valuesRemapped++;
            stats.remappedValues.push({ code, from: rawValue, to: match.value });
            changes.push(`  ${code}: "${rawValue}" → "${match.value}"`);
            val.value = match.value;
            val.label = match.label;
            if (match.hex) val.hex = match.hex;
            changed = true;
          }
        } else {
          const slug = normalizeTokenToSlug(rawValue);
          const label = capitalizeLabel(slug);
          const hex = val.hex || (code === "color" ? COLOR_HEX_MAP[slug] || null : null);

          stats.unmatchedValues.push({ sku: product.sku || product._id, code, value: rawValue, label });

          if (!attrUpdates.has(attrDef._id.toString())) {
            attrUpdates.set(attrDef._id.toString(), { attrDef, newValues: [] });
          }
          attrUpdates.get(attrDef._id.toString()).newValues.push({
            value: slug, label, hex: hex || undefined, isActive: true,
          });

          if (val.value !== slug || val.label !== label || (!val.hex && hex)) {
            valueRemap.set(rawValue, slug);
            val.value = slug;
            val.label = label;
            if (hex) val.hex = hex;
            changed = true;
            changes.push(`  ${code}: "${rawValue}" → new "${slug}" (label: "${label}"${hex ? `, hex: ${hex}` : ""})`);
          }
          stats.newAllowedValues++;
        }
      }

      if (valueRemap.size > 0 && Array.isArray(product.variants)) {
        for (const variant of product.variants) {
          for (const map of [variant.options, variant.attributes]) {
            if (map && typeof map === "object") {
              const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
              for (const [k, v] of entries) {
                if (k.toLowerCase() === code && valueRemap.has(v)) {
                  const newVal = valueRemap.get(v);
                  if (map instanceof Map) {
                    map.set(k, newVal);
                  } else {
                    map[k] = newVal;
                  }
                  changed = true;
                }
              }
            }
          }
        }
        if (!changes.some((c) => c.includes(`variants[].`))) {
          changes.push(`  variants[].${code}: synced (${valueRemap.size} remap(s))`);
        }
      }
    }

    // Sync variant attributes even when variantOptions are already normalized
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const validValues = new Map();
      for (const opt of product.variantOptions || []) {
        const code = (opt.code || "").toLowerCase();
        if (attrFilter && code !== attrFilter.toLowerCase()) continue;
        validValues.set(code, new Set((opt.values || []).map((v) => v.value)));
      }

      for (const variant of product.variants) {
        for (const map of [variant.options, variant.attributes]) {
          if (!map || typeof map !== "object") continue;
          const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
          for (const [k, v] of entries) {
            const code = k.toLowerCase();
            const valid = validValues.get(code);
            if (valid && !valid.has(v)) {
              const remapped = matchValue(v, lookups.get(code) || new Map());
              const newVal = remapped ? remapped.value : v;
              if (newVal !== v) {
                if (map instanceof Map) {
                  map.set(k, newVal);
                } else {
                  map[k] = newVal;
                }
                changed = true;
                changes.push(`  variants[].${code}: "${v}" → "${newVal}"`);
              }
            }
          }
        }
      }
    }

    // Rebuild uiMeta.color (only when processing color or all attributes)
    if (!attrFilter || attrFilter.toLowerCase() === "color") {
      const colorOption = (product.variantOptions || []).find(
        (o) => (o.code || "").toLowerCase() === "color"
      );
      const colorAttrDef = attrByCode.get("color");

      if (colorOption && colorAttrDef) {
        const hexLookup = new Map();
        for (const av of (colorAttrDef.allowedValues || []).filter((v) => v.isActive !== false)) {
          const h = normalizeHex(av.hex);
          if (h) hexLookup.set(normalizeTokenToSlug(av.value), h);
        }

        const newColorMeta = {};
        for (const val of (colorOption.values || [])) {
          const slug = normalizeTokenToSlug(val.value);
          const hex = hexLookup.get(slug) || normalizeHex(val.hex);
          if (slug && hex) newColorMeta[slug] = { hex };
        }

        const oldStr = JSON.stringify(product.uiMeta?.color || {});
        const newStr = JSON.stringify(newColorMeta);
        if (oldStr !== newStr && Object.keys(newColorMeta).length > 0) {
          stats.uiMetaChanged++;
          changes.push(`  uiMeta.color: rebuilt`);
        }
      }
    }

    if (changed) {
      stats.productsUpdated++;
      console.log(`[${product.sku || product._id}] ${product.name || "Unnamed"}`);
      changes.forEach((c) => console.log(c));

      if (!dryRun) {
        const updateOps = { variantOptions: product.variantOptions };

        if (changes.some((c) => c.includes("variants[]"))) {
          updateOps.variants = product.variants;
        }

        if (changes.some((c) => c.includes("uiMeta"))) {
          const colorOpt = (product.variantOptions || []).find(
            (o) => (o.code || "").toLowerCase() === "color"
          );
          const cAttrDef = attrByCode.get("color");
          if (colorOpt && cAttrDef) {
            const hLookup = new Map();
            for (const av of (cAttrDef.allowedValues || []).filter((v) => v.isActive !== false)) {
              const h = normalizeHex(av.hex);
              if (h) hLookup.set(normalizeTokenToSlug(av.value), h);
            }
            const colorMeta = {};
            for (const val of (colorOpt.values || [])) {
              const slug = normalizeTokenToSlug(val.value);
              const hex = hLookup.get(slug) || normalizeHex(val.hex);
              if (slug && hex) colorMeta[slug] = { hex };
            }
            updateOps.uiMeta = { ...(product.uiMeta || {}), color: colorMeta };
          }
        }

        await Product.updateOne({ _id: product._id }, { $set: updateOps });
      }
    } else {
      stats.productsSkipped++;
    }
  }

  // Add new allowed values to AttributeDefinitions
  console.log(`\n${"─".repeat(60)}`);
  console.log(`New allowed values to add to AttributeDefinitions:`);
  console.log(`${"─".repeat(60)}`);

  for (const [attrId, { attrDef, newValues }] of attrUpdates.entries()) {
    const seen = new Set((attrDef.allowedValues || []).map((v) => v.value));
    const uniqueNew = newValues.filter((v) => {
      if (seen.has(v.value)) return false;
      seen.add(v.value);
      return true;
    });
    if (uniqueNew.length === 0) continue;

    console.log(`\n  ${attrDef.code} (${attrDef.label}): +${uniqueNew.length} new values`);
    for (const nv of uniqueNew) console.log(`    + ${nv.value} (${nv.label})`);

    if (!dryRun) {
      await AttributeDefinition.updateOne(
        { _id: attrDef._id },
        { $push: { allowedValues: { $each: uniqueNew } } }
      );
    }
  }

  // Backfill hex codes for existing color allowedValues
  if (!attrFilter || attrFilter.toLowerCase() === "color") {
    const colorDef = attrByCode.get("color");
    if (colorDef) {
      const updates = [];
      for (const av of (colorDef.allowedValues || [])) {
        if (!av.hex || !normalizeHex(av.hex)) {
          const slug = normalizeTokenToSlug(av.value);
          const hex = COLOR_HEX_MAP[slug];
          if (hex) {
            updates.push({ slug, hex, oldHex: av.hex || null });
            if (!dryRun) {
              await AttributeDefinition.updateOne(
                { _id: colorDef._id, "allowedValues.value": av.value },
                { $set: { "allowedValues.$.hex": hex } }
              );
            }
          }
        }
      }
      if (updates.length > 0) {
        console.log(`\n${"─".repeat(60)}`);
        console.log(`Backfilled hex codes for color allowedValues:`);
        console.log(`${"─".repeat(60)}`);
        for (const u of updates) {
          console.log(`  ${u.slug}: ${u.oldHex || "(none)"} → ${u.hex}`);
        }
      }
    }
  }

  // Recalculate usageCount
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Recalculating usageCount...`);
  console.log(`${"─".repeat(60)}`);

  for (const attr of allProducts.length > 0 ? await AttributeDefinition.find({}).lean() : []) {
    const code = attr.code.toLowerCase();
    if (attrFilter && code !== attrFilter.toLowerCase()) continue;
    const count = await Product.countDocuments({ "variantOptions.code": code });

    if (!dryRun && count !== attr.usageCount) {
      await AttributeDefinition.updateOne(
        { _id: attr._id },
        { $set: { usageCount: count, isLocked: count > 0 } }
      );
    }
    const changed = count !== attr.usageCount ? ` (was ${attr.usageCount})` : "";
    console.log(`  ${attr.code}: usageCount = ${count}${changed}`);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  const modeFilter = args.includes("--filter");
  const modeVariant = args.includes("--variant");

  // Parse --attr <code> (optional, only with --variant)
  const attrIndex = args.indexOf("--attr");
  const attrFilter = attrIndex !== -1 ? args[attrIndex + 1] : null;

  if (!dryRun && !apply) {
    console.log("Usage:");
    console.log("  --filter                    Normalize filterAttributes only");
    console.log("  --variant                   Normalize all variantOptions + uiMeta + usageCount");
    console.log("  --variant --attr <code>     Normalize variantOptions for a single attribute");
    console.log("  --dry-run                   Preview changes (no writes)");
    console.log("  --apply                     Apply changes");
    console.log("\nExamples:");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --filter --dry-run");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --filter --apply");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --attr size --dry-run");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --attr size --apply");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --attr color --dry-run");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --attr color --apply");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --dry-run");
    console.log("  node src/scripts/migrate-product-values-to-presets.js --variant --apply");
    process.exit(1);
  }

  if (!modeFilter && !modeVariant) {
    console.log("Error: specify --filter or --variant");
    process.exit(1);
  }

  if (modeFilter && modeVariant) {
    console.log("Error: use --filter or --variant, not both at once");
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI not found in .env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("Connected.\n");

  // Fetch AttributeDefinitions
  const allAttributes = await AttributeDefinition.find({}).lean();
  const attrByCode = new Map();
  for (const attr of allAttributes) attrByCode.set(attr.code.toLowerCase(), attr);

  console.log(`Found ${allAttributes.length} attribute definitions:`);
  for (const attr of allAttributes) {
    const activeCount = (attr.allowedValues || []).filter((v) => v.isActive !== false).length;
    console.log(`  ${attr.code} (${attr.label}) — ${activeCount} allowed values, role: ${attr.role}`);
  }
  console.log();

  // Build lookups
  const lookups = new Map();
  for (const attr of allAttributes) {
    lookups.set(attr.code, buildAllowedValueLookup(attr, VARIANT_OPTION_ALIASES[attr.code] || {}));
  }

  // Fetch all products
  const allProducts = await Product.find({}).lean();
  console.log(`Found ${allProducts.length} products.\n`);

  let stats;

  if (modeFilter) {
    stats = await migrateFilterAttributes(dryRun, allProducts, lookups, attrByCode);
  } else {
    stats = await migrateVariantOptions(dryRun, allProducts, lookups, attrByCode, attrFilter);
  }

  // Summary
  const modeLabel = modeFilter
    ? "--filter"
    : attrFilter ? `--variant --attr ${attrFilter}` : "--variant";
  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY (${dryRun ? "DRY RUN" : "APPLIED"} — ${modeLabel})`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total products:       ${allProducts.length}`);
  console.log(`Products updated:     ${stats.productsUpdated}`);
  console.log(`Products skipped:     ${stats.productsSkipped}`);

  if (modeFilter) {
    console.log(`Values remapped:      ${stats.totalRemapped}`);
    if (stats.remappedDetails.length > 0) {
      console.log(`\nRemapped values:`);
      for (const r of stats.remappedDetails) {
        console.log(`  [${r.sku}] ${r.key}: "${r.from}" → "${r.to}"`);
      }
    }
    if (stats.unmatchedValues.length > 0) {
      console.log(`\nNew values added to presets:`);
      for (const u of stats.unmatchedValues) {
        console.log(`  ${u.code}: "${u.value}" (${u.label})`);
      }
    }
  } else {
    console.log(`Values remapped:      ${stats.valuesRemapped}`);
    console.log(`New allowed values:   ${stats.newAllowedValues}`);
    console.log(`uiMeta.color rebuilt: ${stats.uiMetaChanged}`);
    if (stats.unmatchedValues.length > 0) {
      console.log(`\nUnmatched values (added as new allowed values):`);
      for (const u of stats.unmatchedValues) {
        console.log(`  [${u.sku}] ${u.code}: "${u.value}" (${u.label})`);
      }
    }
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
