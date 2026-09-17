/**
 * Catalog Attribute Value Resolver
 * -----------------------------------------------------------------------------
 * Deterministic "AI training data" layer for the product import pipeline.
 *
 * Maps a raw, messy attribute value (e.g. "0-3-months", "0-3m", "03m", "small",
 * "90 x 90 cm", "'0-6 Month") to the canonical allowed value stored in the
 * store Attribute Registry (knowledge base).
 *
 * This module is intentionally kept OUTSIDE the LLM call so the same canonical
 * answer is produced every run — the AI may suggest, but this resolver is the
 * final authority before data reaches validation / commit.
 *
 * Training data lives in SIZE_SYNONYM_MAP below. Extend it to teach the system
 * new spellings without touching the LLM prompt.
 */

"use strict";

const {
  normalizeFilterTokenByKey,
  FILTER_ATTRIBUTE_DEFINITIONS,
} = require("./filterAttributeRules");

// ---------------------------------------------------------------------------
// TRAINING DATA — size vocabulary (keep this map — it is the durable training
// set that prevents the repeated "0-3-months vs 0-3 Month" mistakes).
//
// Keys are the canonical *filter* slugs used across the storefront; values are
// alternate spellings that collapse to that canonical. Age ranges, letters,
// newborn/premature and dimension sizes are all covered.
// ---------------------------------------------------------------------------
const SIZE_SYNONYM_MAP = {
  premature: [
    "premature",
    "preemie",
    "premie",
    "pre-term",
    "preterm",
    "pre born",
    "pre-birth",
    "pre birth",
  ],
  newborn: [
    "newborn",
    "new born",
    "new-born",
    "nb",
    "newborns",
    "new borns",
    "0-1-month",
    "0-1-months",
    "0-1month",
    "birth",
  ],
  "0-3-months": [
    "0-3-months",
    "0-3-month",
    "0-3m",
    "0-3 mo",
    "0-3",
    "03m",
    "0 3 month",
    "0 3 months",
    "0-3months",
    "0-3mo",
    "0-3-m",
  ],
  "0-6-months": [
    "0-6-months",
    "0-6-month",
    "0-6m",
    "0-6 mo",
    "0-6",
    "06m",
    "0 6 month",
    "0 6 months",
    "0-6months",
    "0-6mo",
  ],
  "3-6-months": [
    "3-6-months",
    "3-6-month",
    "3-6m",
    "3-6 mo",
    "3-6",
    "36m",
    "3 6 month",
    "3 6 months",
    "3-6months",
    "3-6mo",
    "3-6-m",
  ],
  "6-9-months": [
    "6-9-months",
    "6-9-month",
    "6-9m",
    "6-9 mo",
    "6-9",
    "69m",
    "6 9 month",
    "6 9 months",
    "6-9months",
    "6-9mo",
  ],
  "6-12-months": [
    "6-12-months",
    "6-12-month",
    "6-12m",
    "6-12 mo",
    "6-12",
    "612m",
    "6 12 month",
    "6 12 months",
    "6-12months",
    "6-12mo",
  ],
  "9-12-months": [
    "9-12-months",
    "9-12-month",
    "9-12m",
    "9-12 mo",
    "9-12",
    "912m",
    "9 12 month",
    "9 12 months",
    "9-12months",
    "9-12mo",
  ],
  "12-18-months": [
    "12-18-months",
    "12-18-month",
    "12-18m",
    "12-18 mo",
    "12-18",
    "1218m",
    "12 18 month",
    "12 18 months",
    "12-18months",
    "12-18mo",
  ],
  "18-24-months": [
    "18-24-months",
    "18-24-month",
    "18-24m",
    "18-24 mo",
    "18-24",
    "1824m",
    "18 24 month",
    "18 24 months",
    "18-24months",
    "18-24mo",
    "2-years",
    "2yr",
  ],
  s: ["s", "small", "sm", "size-s", "size-s"],
  m: ["m", "medium", "md", "size-m"],
  l: ["l", "large", "lg", "size-l"],
  "free-size": [
    "free-size",
    "free size",
    "freesize",
    "free",
    "one-size",
    "one size",
    "onesize",
    "one size fits all",
    "one-size-fits-all",
    "adjustable",
  ],
};

// Sizes that have a numeric age range and are likely to be mistyped with
// hyphens/pluralisation. Used by the numeric fallback matcher.
const AGE_RANGE_VALUES = [
  { key: "0-3-months", a: 0, b: 3 },
  { key: "3-6-months", a: 3, b: 6 },
  { key: "6-9-months", a: 6, b: 9 },
  { key: "9-12-months", a: 9, b: 12 },
  { key: "0-6-months", a: 0, b: 6 },
  { key: "6-12-months", a: 6, b: 12 },
  { key: "12-18-months", a: 12, b: 18 },
  { key: "18-24-months", a: 18, b: 24 },
];

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Collapse a raw value to a canonical, comparable key. */
function toSlugKey(raw) {
  if (raw === undefined || raw === null) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/^'+/, "") // strip Excel leading apostrophe
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s*[-]\s*/g, "-") // "0 - 3" -> "0-3"
    .replace(/\s+/g, "-") // "0 3" -> "0-3"
    .replace(/[-]+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

/** Canonicalise dimension sizes: "90 x 90 cm" -> "90x90cm", "25x30in" -> "25x30inches". */
function parseDimension(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^'+/, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
  const m = s.match(/^(\d+)\s*[x×*]\s*(\d+)\s*(cm|inches?|in)?$/);
  if (!m) return null;
  let unit = (m[3] || "").toLowerCase();
  if (unit === "in" || unit === "inch") unit = "inches";
  return `${m[1]}x${m[2]}${unit}`;
}

/**
 * Build a lookup index (normalised key -> allowedValue) from a KB allowed
 * values array. Includes value, label, label slug, synonyms, the filter
 * canonical slug and the plural age-range forms.
 */
function buildAllowedIndex(allowedValues, code) {
  const index = new Map();
  const add = (key, av) => {
    const k = String(key ?? "").trim().toLowerCase();
    if (k) index.set(k, av);
  };

  for (const av of allowedValues) {
    add(av.value, av);
    add(av.label, av);
    add(toSlugKey(av.label), av);
    if (av.value) add(toSlugKey(av.value), av);

    // Filter-canonical forms from the storefront synonym maps (size/color...).
    const filterCanonical = normalizeFilterTokenByKey(code, av.value || "");
    if (filterCanonical) add(filterCanonical, av);

    // Plural age-range form so "0-3-months" (plural) and "0-3-month" (singular)
    // both collapse to the same allowed value.
    if (code === "size") {
      const plural = String(av.value || "").replace(/-month(-?)(.*)$/, "-months$1$2");
      if (plural && plural !== String(av.value)) add(plural, av);
    }

    for (const syn of av.synonyms || []) {
      add(syn, av);
      add(toSlugKey(syn), av);
      const synFilter = normalizeFilterTokenByKey(code, syn);
      if (synFilter) add(synFilter, av);
    }

    // Durable training data: even when the DB synonyms haven't been backfilled
    // yet, map this allowed value to its SIZE_SYNONYM_MAP canonical and expose
    // every known spelling of it.
    if (code === "size") {
      const filterKey = normalizeFilterTokenByKey("size", av.value || "");
      let canonical = filterKey && SIZE_SYNONYM_MAP[filterKey] ? filterKey : null;
      if (!canonical && filterKey) {
        for (const key of Object.keys(SIZE_SYNONYM_MAP)) {
          if (normalizeFilterTokenByKey("size", key) === filterKey) {
            canonical = key;
            break;
          }
        }
      }
      if (canonical && SIZE_SYNONYM_MAP[canonical]) {
        add(canonical, av);
        for (const alias of SIZE_SYNONYM_MAP[canonical]) {
          add(alias, av);
          add(toSlugKey(alias), av);
          const aliasFilter = normalizeFilterTokenByKey("size", alias);
          if (aliasFilter) add(aliasFilter, av);
        }
      }
    }
  }

  return index;
}

/** Candidate comparison keys for a raw input value. */
function candidateKeys(raw, code) {
  const keys = new Set();
  const clean = String(raw ?? "").trim().toLowerCase().replace(/^'+/, "");
  if (!clean) return keys;

  const slug = toSlugKey(clean);
  if (slug) keys.add(slug);

  // Age-range: "0-3-months" -> both plural and singular forms.
  if (code === "size") {
    const ageMatch = slug.match(/^(\d+)-(\d+)-?months?$/) || slug.match(/^(\d+)-(\d+)$/);
    if (ageMatch) {
      const [a, b2, ] = [Number(ageMatch[1]), Number(ageMatch[2])];
      keys.add(`${ageMatch[1]}-${ageMatch[2]}-month`);
      keys.add(`${ageMatch[1]}-${ageMatch[2]}-months`);
      if (String(a).length === 1 && String(b2).length === 1) {
        keys.add(`${ageMatch[1]}${ageMatch[2]}m`);
      }
    }
    // "0-3m" / "3-6m" compact month marker
    const compact = slug.match(/^(\d+)-(\d+)m$/);
    if (compact) {
      keys.add(`${compact[1]}-${compact[2]}-month`);
      keys.add(`${compact[1]}-${compact[2]}-months`);
    }
    const dim = parseDimension(clean);
    if (dim) keys.add(dim);
  }

  // Storefront filter canonical (handles small->s, nb->newborn, etc.).
  const filterCanonical = normalizeFilterTokenByKey(code, clean);
  if (filterCanonical) keys.add(filterCanonical);

  return keys;
}

/**
 * Resolve a raw attribute value against the attribute's allowed values.
 * @param {string} rawValue
 * @param {Array<{value: string, label: string, synonyms?: string[]}>} allowedValues
 * @param {string} [code] attribute code e.g. "size", "color"
 * @returns {object|null} the matching allowedValue object, or null
 */
function resolveCatalogValue(rawValue, allowedValues = [], code = "") {
  if (rawValue === undefined || rawValue === null || !String(rawValue).trim()) {
    return null;
  }
  if (!Array.isArray(allowedValues) || allowedValues.length === 0) return null;

  const codeKey = (code || "").toLowerCase().trim();
  const index = buildAllowedIndex(allowedValues, codeKey);
  const keys = candidateKeys(String(rawValue), codeKey);

  let matched = null;
  for (const key of keys) {
    if (index.has(key)) {
      matched = index.get(key);
      break;
    }
  }

  // Numeric fallback: raw looks like an age range the index missed.
  if (!matched && codeKey === "size") {
    const range = String(rawValue)
      .toLowerCase()
      .match(/(\d{1,2})\s*(?:[-–]|to)\s*(\d{1,2})/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      // Ignore "MM/DD" date-style matches (e.g. "02-Feb").
      if (a >= 0 && b >= 0 && a < b && a <= 24 && b <= 24) {
        const hit = AGE_RANGE_VALUES.find((r) => r.a === a && r.b === b);
        if (hit) {
          const hitSlug = normalizeFilterTokenByKey("size", hit.key);
          matched = allowedValues.find((av) =>
            normalizeFilterTokenByKey("size", av.value) === hitSlug ||
            normalizeFilterTokenByKey("size", av.label) === hitSlug
          );
        }
      }
    }
  }

  return matched;
}

/** Convenience: resolve a size raw value to its canonical store label. */
function resolveSizeLabel(rawValue, sizeAllowedValues) {
  const av = resolveCatalogValue(rawValue, sizeAllowedValues, "size");
  return av ? String(av.label).trim() : "";
}

/** Convenience: resolve a value to its canonical store label (any attribute). */
function resolveAttributeLabel(rawValue, allowedValues, code) {
  const av = resolveCatalogValue(rawValue, allowedValues, code);
  return av ? String(av.label).trim() : "";
}

/**
 * Post-processor: enforce canonical, store-compliant values on parsed import
 * products — runs after BOTH the LLM and the deterministic fallback so the AI
 * never silently ships a bad size/color. Also strips Excel leading apostrophes
 * which would otherwise fail strict validation.
 *
 * Mutates and returns the products array.
 *
 * @param {Array} products ParsedParentProduct[] shape
 * @param {*} kb knowledge base (with .attributes)
 */
function normalizeImportProducts(products, kb) {
  if (!Array.isArray(products)) return products;
  const sizeAttr = (kb?.attributes || []).find((a) => a.code === "size");
  const colorAttr = (kb?.attributes || []).find((a) => a.code === "color");

  for (const product of products) {
    const list = Array.isArray(product.variants) && product.variants.length
      ? product.variants
      : product && product.product_type !== "CONFIGURABLE" && !product.variants
        ? [product]
        : product.variants || [];

    for (const variant of list) {
      if (!variant) continue;

      // ---- Size ----
      const rawSize =
        variant.attributes?.size ??
        variant.attributes?.Size ??
        variant.variant_size ??
        variant.size ??
        "";
      const canonicalSize = resolveSizeLabel(rawSize, sizeAttr?.allowedValues);
      if (canonicalSize) {
        if (variant.attributes) {
          variant.attributes.size = canonicalSize;
          if (variant.attributes.Size !== undefined) delete variant.attributes.Size;
        }
        if ("variant_size" in variant) variant.variant_size = canonicalSize;
        if ("size" in variant && variant.size !== undefined) variant.size = canonicalSize;
      } else if (rawSize) {
        // Known mess we could not resolve: at least strip Excel apostrophes so
        // strict validation has a fair chance.
        const cleaned = String(rawSize).replace(/^'+/, "").trim();
        if (variant.attributes) variant.attributes.size = cleaned;
        if ("variant_size" in variant) variant.variant_size = cleaned;
      }

      // ---- Color ----
      const rawColor =
        variant.attributes?.color ??
        variant.attributes?.Color ??
        variant.variant_color ??
        "";
      const canonicalColor = resolveAttributeLabel(rawColor, colorAttr?.allowedValues, "color");
      if (canonicalColor) {
        if (variant.attributes) {
          variant.attributes.color = canonicalColor;
          if (variant.attributes.Color !== undefined) delete variant.attributes.Color;
        }
        if ("variant_color" in variant) variant.variant_color = canonicalColor;
      }
    }
  }

  return products;
}

module.exports = {
  SIZE_SYNONYM_MAP,
  AGE_RANGE_VALUES,
  normalizeFilterTokenByKey,
  FILTER_ATTRIBUTE_DEFINITIONS,
  toSlugKey,
  parseDimension,
  resolveCatalogValue,
  resolveSizeLabel,
  resolveAttributeLabel,
  normalizeImportProducts,
};