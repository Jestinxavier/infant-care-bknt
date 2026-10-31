/**
 * Normalize size vocabulary across the Attribute Registry and products.
 *
 * One meaning = one value + one label:
 *   value: "0-12-months"   (identity slug)
 *   label: "0-12M"         (display text)
 *
 * Every month-range spelling ("0-12m", "0 - 12 Months", "0 12 Month",
 * "0–12M") collapses to that pair. Duplicate registry rows with the same
 * meaning are merged into one value; their spellings become synonyms.
 *
 * Non-month sizes (S, M, Free Size, "110x110cm") are left alone unless two
 * rows genuinely mean the same thing.
 *
 * Dry-run by default:
 *   node scripts/normalize-attribute-labels.js
 *   node scripts/normalize-attribute-labels.js --apply
 *   node scripts/normalize-attribute-labels.js --attribute size
 *   node scripts/normalize-attribute-labels.js --uri <mongodb-url>
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const AttributeDefinition = require("../src/models/AttributeDefinition");
const Product = require("../src/models/Product");
const {
  canonicalSizeLabel,
  canonicalSizeValue,
  looseToken,
  sizeIdentityKey,
} = require("../src/utils/attributeValueNormalizer");
const { parseMode, flagValue, resolveMongoUri, redactUri, hostDbOf } = require("./lib/cliMode");

const argv = process.argv.slice(2);
const { apply: WRITE } = parseMode(argv, { defaultMode: "dry" });
const ATTRIBUTE_FILTER = flagValue(argv, "--attribute");
const MONGO_URI = resolveMongoUri(argv);

const MAX_SAMPLES = 15;

const stats = {
  definitionsInspected: 0,
  labelsChanged: 0,
  valuesRewritten: 0,
  duplicatesMerged: 0,
  productsInspected: 0,
  productsChanged: 0,
  variantOptionValues: 0,
  variantAttributes: 0,
  filterAttributeValues: 0,
};

const samples = [];

const nonMonthSizeChanges = new Map(); // "raw -> next" for non-month sizes
const variantOptionChangesByCode = new Map();

const sample = (message) => {
  if (samples.length < MAX_SAMPLES) samples.push(message);
};

const isSizeCode = (code) => String(code || "").trim().toLowerCase() === "size";

const getEntries = (mapOrObj) => {
  if (!mapOrObj) return [];
  if (mapOrObj instanceof Map) return [...mapOrObj.entries()];
  return Object.entries(mapOrObj);
};

/** Build per-attribute loose-token lookup from registry values/labels/synonyms. */
function buildCatalogLookup(attributes) {
  const byCode = new Map();
  for (const attribute of attributes) {
    const code = String(attribute.code || "").toLowerCase();
    if (!code) continue;
    const lookup = new Map();
    for (const av of attribute.allowedValues || []) {
      if (!av || av.isActive === false) continue;
      for (const candidate of [av.value, av.label, ...(av.synonyms || [])]) {
        const token = looseToken(candidate);
        if (token && !lookup.has(token)) lookup.set(token, av);
      }
    }
    byCode.set(code, lookup);
  }
  return byCode;
}

/** Rewrite one raw value for an attribute; returns { value, label, changed }. */
function normalizeAttributeValue({ code, rawValue, rawLabel, catalog, hasLabel = true }) {
  const raw = rawValue == null ? "" : String(rawValue);
  const label = rawLabel == null ? "" : String(rawLabel);
  const labelDiffers = (nextLabel) =>
    hasLabel && nextLabel && label !== String(nextLabel);

  if (isSizeCode(code)) {
    const canonicalValue = canonicalSizeValue(raw);
    const canonicalLabel = canonicalSizeLabel(raw);
    if (canonicalValue) {
      return {
        value: canonicalValue,
        label: canonicalLabel,
        changed: raw !== canonicalValue || labelDiffers(canonicalLabel),
      };
    }
    const match = catalog.get(looseToken(raw));
    if (match) {
      if (raw !== match.value) {
        const key = `"${raw}" -> "${match.value}"`;
        nonMonthSizeChanges.set(key, (nonMonthSizeChanges.get(key) || 0) + 1);
      }
      return {
        value: match.value,
        label: match.label || match.value,
        changed: raw !== match.value || labelDiffers(match.label),
      };
    }
    return { value: raw, label: rawLabel, changed: false };
  }

  const match = catalog.get(looseToken(raw));
  if (match) {
    return {
      value: match.value,
      label: match.label || match.value,
      changed: raw !== match.value || labelDiffers(match.label),
    };
  }
  return { value: raw, label: rawLabel, changed: false };
}

async function normalizeDefinitions(attributes) {
  const saved = [];

  for (const attribute of attributes) {
    const code = String(attribute.code || "").toLowerCase();
    const size = isSizeCode(code);
    const groups = new Map(); // identity -> { keeper, rows[] }

    for (const av of attribute.allowedValues || []) {
      const rawValue = String(av.value ?? "").trim();
      if (!rawValue) continue;

      const canonicalValue = size ? canonicalSizeValue(rawValue) || rawValue : rawValue;
      const canonicalLabel = size ? canonicalSizeLabel(rawValue) : null;
      const identity = size ? sizeIdentityKey(rawValue) : looseToken(rawValue);

      if (canonicalValue !== rawValue) {
        stats.valuesRewritten += 1;
        sample(`[${code}] value "${rawValue}" -> "${canonicalValue}"`);
      }
      if (canonicalLabel && canonicalLabel !== av.label) {
        stats.labelsChanged += 1;
        sample(`[${code}] label "${av.label}" -> "${canonicalLabel}"`);
      }

      const row = {
        ...(av.toObject ? av.toObject() : av),
        value: canonicalValue,
        label: canonicalLabel || av.label || canonicalValue,
      };

      if (!groups.has(identity)) {
        groups.set(identity, { rows: [] });
      }
      groups.get(identity).rows.push({ row, preferred: rawValue === canonicalValue });
    }

    const nextValues = [];
    for (const group of groups.values()) {
      // Prefer a row that already carries the canonical identity; otherwise
      // keep the first row (it usually has the merchant-facing label).
      const keeper =
        group.rows.find((entry) => entry.preferred)?.row || group.rows[0].row;

      const synonyms = new Set(
        (Array.isArray(keeper.synonyms) ? keeper.synonyms : [])
          .map((s) => String(s).trim())
          .filter(Boolean),
      );
      const seen = new Set([looseToken(keeper.value), looseToken(keeper.label)]);

      for (const { row } of group.rows) {
        for (const candidate of [row.value, row.label, ...(row.synonyms || [])]) {
          const text = String(candidate ?? "").trim();
          const token = looseToken(text);
          if (!text || !token || seen.has(token)) continue;
          seen.add(token);
          synonyms.add(text);
        }
      }

      nextValues.push({
        ...keeper,
        // Preserve the merchant's existing synonym order; new spellings are
        // appended below so untouched rows stay byte-identical.
        synonyms: [...synonyms],
      });

      if (group.rows.length > 1) {
        stats.duplicatesMerged += group.rows.length - 1;
        sample(
          `[${code}] merge ${group.rows
            .map((entry) => `"${entry.row.value}"`)
            .join(" + ")} -> "${keeper.value}"`,
        );
      }
    }

    const before = JSON.stringify(
      (attribute.allowedValues || []).map((av) => ({
        value: av.value,
        label: av.label,
        synonyms: av.synonyms || [],
      })),
    );
    const after = JSON.stringify(
      nextValues.map((av) => ({
        value: av.value,
        label: av.label,
        synonyms: av.synonyms || [],
      })),
    );

    if (before === after) continue;

    if (WRITE) {
      await AttributeDefinition.updateOne(
        { _id: attribute._id },
        { $set: { allowedValues: nextValues } },
      );
    }
    saved.push({
      code,
      before: JSON.parse(before),
      after: JSON.parse(after),
    });
  }

  return saved;
}

async function normalizeProducts(catalogByCode) {
  const query = {};
  if (ATTRIBUTE_FILTER) {
    query.$or = [
      { "variantOptions.code": ATTRIBUTE_FILTER },
      { [`variants.attributes.${ATTRIBUTE_FILTER}`]: { $exists: true } },
      { [`filterAttributes.${ATTRIBUTE_FILTER}`]: { $exists: true } },
    ];
  }

  const products = await Product.find(query).lean();
  stats.productsInspected = products.length;

  for (const product of products) {
    let productChanged = false;

    const variantOptions = (product.variantOptions || []).map((option) => {
      const code = String(option.code || option.name || "").toLowerCase();
      if (ATTRIBUTE_FILTER && code !== ATTRIBUTE_FILTER) return option;
      const catalog = catalogByCode.get(code) || new Map();

      const values = (option.values || []).map((valueItem) => {
        if (!valueItem || typeof valueItem !== "object") return valueItem;
        const next = normalizeAttributeValue({
          code,
          rawValue: valueItem.value ?? valueItem.label,
          rawLabel: valueItem.label,
          catalog,
        });
        if (!next.changed) return valueItem;
        stats.variantOptionValues += 1;
        variantOptionChangesByCode.set(
          code,
          (variantOptionChangesByCode.get(code) || 0) + 1,
        );
        productChanged = true;
        sample(
          `[product ${product._id}] ${code}: "${valueItem.value}" / "${valueItem.label}" -> "${next.value}" / "${next.label}"`,
        );
        return { ...valueItem, value: next.value, label: next.label };
      });

      return { ...option, values };
    });

    const variants = (product.variants || []).map((variant) => {
      let variantChanged = false;
      const nextVariant = { ...variant };

      for (const field of ["attributes", "options"]) {
        const attrs = variant?.[field];
        if (!attrs) continue;
        const isMap = attrs instanceof Map;
        const entries = getEntries(attrs);
        const nextEntries = entries.map(([key, rawValue]) => {
          const code = String(key || "").toLowerCase();
          if (ATTRIBUTE_FILTER && code !== ATTRIBUTE_FILTER) return [key, rawValue];
          const catalog = catalogByCode.get(code) || new Map();
          const next = normalizeAttributeValue({
            code,
            rawValue,
            rawLabel: rawValue,
            catalog,
            hasLabel: false,
          });
          if (next.changed) {
            stats.variantAttributes += 1;
            variantChanged = true;
            productChanged = true;
            sample(
              `[product ${product._id}] variant ${code}: "${rawValue}" -> "${next.value}"`,
            );
            return [key, next.value];
          }
          return [key, rawValue];
        });

        nextVariant[field] = isMap ? new Map(nextEntries) : Object.fromEntries(nextEntries);
      }

      return variantChanged ? nextVariant : variant;
    });

    let filterAttributes = product.filterAttributes;
    if (filterAttributes && typeof filterAttributes === "object") {
      const isMap = filterAttributes instanceof Map;
      const entries = getEntries(filterAttributes);
      let filterChanged = false;

      const nextEntries = entries.map(([key, rawValues]) => {
        const code = String(key || "").toLowerCase();
        if (ATTRIBUTE_FILTER && code !== ATTRIBUTE_FILTER) return [key, rawValues];
        const catalog = catalogByCode.get(code) || new Map();
        const list = Array.isArray(rawValues) ? rawValues : [rawValues];
        const nextList = [];
        const seen = new Set();

        for (const rawValue of list) {
          const next = normalizeAttributeValue({
            code,
            rawValue,
            rawLabel: rawValue,
            catalog,
            hasLabel: false,
          });
          if (next.changed) {
            stats.filterAttributeValues += 1;
            filterChanged = true;
            productChanged = true;
            sample(
              `[product ${product._id}] filter ${code}: "${rawValue}" -> "${next.value}"`,
            );
          }
          const token = looseToken(next.value);
          if (!seen.has(token)) {
            seen.add(token);
            nextList.push(next.value);
          }
        }

        return [key, nextList];
      });

      if (filterChanged) {
        filterAttributes = isMap ? new Map(nextEntries) : Object.fromEntries(nextEntries);
      }
    }

    if (!productChanged) continue;

    stats.productsChanged += 1;
    if (WRITE) {
      await Product.updateOne(
        { _id: product._id },
        { $set: { variantOptions, variants, filterAttributes } },
      );
    }
  }
}

async function main() {
  if (!MONGO_URI) throw new Error("MONGODB_URI not found");

  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(
    `\nAttribute vocabulary normalization - ${WRITE ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`,
  );
  console.log(`DB: ${hostDbOf(MONGO_URI).hosts}/${hostDbOf(MONGO_URI).db}`);
  console.log(`URI: ${redactUri(MONGO_URI)}\n`);

  const query = { role: { $in: ["variant", "metadata", "both"] } };
  if (ATTRIBUTE_FILTER) query.code = ATTRIBUTE_FILTER;

  const attributes = await AttributeDefinition.find(query);
  stats.definitionsInspected = attributes.length;

  const changedDefinitions = await normalizeDefinitions(attributes);
  const refreshed = await AttributeDefinition.find(query);
  const catalogByCode = buildCatalogLookup(refreshed);

  await normalizeProducts(catalogByCode);

  console.log("\n" + "=".repeat(58));
  console.log("Summary");
  console.log("=".repeat(58));
  console.log(`Definitions inspected      : ${stats.definitionsInspected}`);
  console.log(`Definitions ${WRITE ? "updated" : "to update"}         : ${changedDefinitions.length}`);
  console.log(`Labels ${WRITE ? "changed" : "to change"}             : ${stats.labelsChanged}`);
  console.log(`Values rewritten           : ${stats.valuesRewritten}`);
  console.log(`Duplicate rows merged      : ${stats.duplicatesMerged}`);
  console.log(`Products inspected         : ${stats.productsInspected}`);
  console.log(`Products ${WRITE ? "updated" : "to update"}           : ${stats.productsChanged}`);
  console.log(`Variant option values      : ${stats.variantOptionValues}`);
  console.log(`Variant attribute values   : ${stats.variantAttributes}`);
  console.log(`Filter attribute values    : ${stats.filterAttributeValues}`);

  if (!WRITE) {
    if (changedDefinitions.length) {
      console.log("\nRegistry value diffs:");
      for (const definition of changedDefinitions) {
        const beforeByValue = new Map(
          definition.before.map((entry) => [entry.value, entry]),
        );
        const afterByValue = new Map(
          definition.after.map((entry) => [entry.value, entry]),
        );
        console.log(`  [${definition.code}] ${definition.before.length} -> ${definition.after.length} values`);
        for (const [value, entry] of beforeByValue) {
          const next = afterByValue.get(value);
          if (!next) {
            console.log(`    - removed ${value}`);
          } else {
            if (next.label !== entry.label) {
              console.log(`    - label ${value}: "${entry.label}" -> "${next.label}"`);
            }
            const beforeSynonyms = entry.synonyms || [];
            const afterSynonyms = next.synonyms || [];
            if (
              beforeSynonyms.length !== afterSynonyms.length ||
              beforeSynonyms.some((s, i) => s !== afterSynonyms[i])
            ) {
              console.log(
                `    - synonyms ${value}: [${beforeSynonyms.join(", ")}] -> [${afterSynonyms.join(", ")}]`,
              );
            }
          }
        }
        for (const value of afterByValue.keys()) {
          if (!beforeByValue.has(value)) console.log(`    - added ${value}`);
        }
      }
    }

    console.log("\nSample changes (first 15):");
    samples.forEach((line) => console.log(`  - ${line}`));

    if (nonMonthSizeChanges.size) {
      console.log("\nNon-month size values rewritten via registry match:");
      [...nonMonthSizeChanges.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([change, count]) => console.log(`  - ${change} (${count})`));
    } else {
      console.log("\nNon-month size values: none rewritten.");
    }

    if (variantOptionChangesByCode.size) {
      console.log("\nVariant option changes by attribute:");
      [...variantOptionChangesByCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([code, count]) => console.log(`  - ${code}: ${count}`));
    }

    console.log("\nNo writes were made. Re-run with --apply to persist.");
  } else {
    console.log("\nWrites complete. Restart the API so cached attribute lookups refresh.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Attribute normalization failed:", error.message || error);
  process.exit(1);
});
