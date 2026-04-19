const FILTER_ATTRIBUTE_KEYS = [
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

const FILTER_ATTRIBUTE_DEFINITIONS = {
  color: {
    allowMultiple: true,
    aliases: {
      gray: ["grey", "charcoal", "slate"],
      multicolor: ["multi-color", "multi color", "multicolour", "multi-colour", "mixed"],
      "off-white": ["offwhite", "off white", "cream", "ivory", "ecru", "beige"],
      "sky-blue": ["sky blue", "skyblue", "light-blue", "light blue", "baby-blue", "baby blue", "powder-blue", "powder blue"],
      "navy-blue": ["navy", "navy blue", "dark-blue", "dark blue", "darkblue", "midnight-blue"],
      "light-green": ["light green", "mint", "mint-green", "mint green", "sage", "pastel-green"],
      "light-pink": ["light pink", "baby-pink", "baby pink", "blush", "pastel-pink", "rose"],
      "hot-pink": ["hot pink", "hotpink", "fuchsia", "magenta"],
      purple: ["violet", "lavender", "mauve", "lilac"],
      brown: ["chocolate", "caramel", "tan", "coffee"],
      orange: ["peach", "coral", "tangerine"],
      yellow: ["lemon", "mustard", "golden-yellow", "golden yellow"],
      white: ["pure-white", "pure white", "snow-white"],
      black: ["jet-black", "jet black", "charcoal-black"],
      red: ["cherry", "scarlet", "crimson"],
    },
  },
  size: {
    allowMultiple: false,
    allowMultipleWhenConfigurable: true,
    aliases: {
      "free-size": ["free size", "freesize", "one size", "onesize", "one-size", "free"],
      newborn: ["new-born", "new born", "nb", "0-1-month", "0-1-months", "0-1-month"],
      "0-3-months": ["0-3-month", "0-3m", "0-3", "0 3 month", "0 3 months", "03m", "0-3mo"],
      "3-6-months": ["3-6-month", "3-6m", "3-6", "3 6 month", "3 6 months", "36m", "3-6mo"],
      "6-9-months": ["6-9-month", "6-9m", "6-9", "6 9 month", "6 9 months", "69m", "6-9mo"],
      "9-12-months": ["9-12-month", "9-12m", "9-12", "9 12 month", "9 12 months", "912m", "9-12mo"],
      "12-18-months": ["12-18-month", "12-18m", "12-18", "12 18 month", "12 18 months", "1218m", "12-18mo"],
      "18-24-months": ["18-24-month", "18-24m", "18-24", "18 24 month", "18 24 months", "1824m", "18-24mo", "2-years", "2yr"],
      "2-3-years": ["2-3-year", "2-3y", "2-3yr", "2-3yrs", "24-36-months", "24-36-month"],
      "3-4-years": ["3-4-year", "3-4y", "3-4yr", "3-4yrs"],
      "4-5-years": ["4-5-year", "4-5y", "4-5yr", "4-5yrs"],
      "5-6-years": ["5-6-year", "5-6y", "5-6yr", "5-6yrs"],
    },
  },
  material: {
    allowMultiple: true,
    aliases: {
      cotton: ["pure-cotton"],
      "organic-cotton": ["organic cotton"],
      wool: ["wollen", "woolen"],
    },
  },
  season: {
    allowMultiple: false,
    aliases: {
      "all-season": ["all season", "all-weather", "all weather"],
    },
  },
  gender: {
    allowMultiple: true,
    aliases: {
      boys: ["boy", "male-kids", "kid-boy"],
      girls: ["girl", "female-kids", "kid-girl"],
      unisex: ["uni-sex", "both"],
    },
  },
  sleeve: {
    allowMultiple: false,
    aliases: {
      "short-sleeve": ["short sleeve", "half-sleeve", "half sleeve"],
      "long-sleeve": ["long sleeve", "full-sleeve", "full sleeve"],
      sleeveless: ["no-sleeve", "without-sleeve"],
    },
  },
  occasion: {
    allowMultiple: true,
    aliases: {
      casual: ["daily", "everyday", "daywear", "day-wear"],
      party: ["partywear", "party-wear"],
      festive: ["festival", "ethnic"],
    },
  },
  pattern: {
    allowMultiple: false,
    aliases: {
      solid: ["plain", "plane", "solid-color", "plain-color"],
      striped: ["stripe", "stripes"],
      printed: ["print", "prints"],
      checked: ["check", "checks", "checkered"],
    },
  },
  pack: {
    allowMultiple: false,
    aliases: {
      "pack-of-1": ["single"],
      "pack-of-2": ["pair", "2-pack", "pack-2", "packof2", "pack-of-two"],
      "pack-of-3": ["3-pack", "pack-3", "packof3", "pack-of-three"],
      "pack-of-4": ["4-pack", "pack-4", "packof4", "pack-of-four"],
    },
  },
};

const normalizeTokenToSlug = (value) => {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

// Forward lookup: any alias slug → canonical slug
const aliasLookups = FILTER_ATTRIBUTE_KEYS.reduce((acc, key) => {
  const aliasMap = new Map();
  const aliases = FILTER_ATTRIBUTE_DEFINITIONS[key]?.aliases || {};

  Object.entries(aliases).forEach(([canonical, variants]) => {
    const canonicalSlug = normalizeTokenToSlug(canonical);
    if (!canonicalSlug) return;
    aliasMap.set(canonicalSlug, canonicalSlug);
    (Array.isArray(variants) ? variants : []).forEach((variant) => {
      const variantSlug = normalizeTokenToSlug(variant);
      if (variantSlug) aliasMap.set(variantSlug, canonicalSlug);
    });
  });

  acc[key] = aliasMap;
  return acc;
}, {});

// Reverse lookup: canonical slug → Set of all slugified aliases (including itself)
const reverseAliasLookups = FILTER_ATTRIBUTE_KEYS.reduce((acc, key) => {
  const reverseMap = new Map();
  const aliases = FILTER_ATTRIBUTE_DEFINITIONS[key]?.aliases || {};

  Object.entries(aliases).forEach(([canonical, variants]) => {
    const canonicalSlug = normalizeTokenToSlug(canonical);
    if (!canonicalSlug) return;

    if (!reverseMap.has(canonicalSlug)) {
      reverseMap.set(canonicalSlug, new Set([canonicalSlug]));
    }
    (Array.isArray(variants) ? variants : []).forEach((variant) => {
      const variantSlug = normalizeTokenToSlug(variant);
      if (variantSlug) reverseMap.get(canonicalSlug).add(variantSlug);
    });
  });

  acc[key] = reverseMap;
  return acc;
}, {});

/**
 * Given a canonical filter value, return it plus all its stored alias slugs.
 * Used in queries so that products with any legacy format are matched.
 */
const expandCanonicalToAliases = (key, canonicalValue) => {
  const reverseMap = reverseAliasLookups[key];
  if (!reverseMap) return [canonicalValue];
  const aliases = reverseMap.get(canonicalValue);
  return aliases ? Array.from(aliases) : [canonicalValue];
};

const normalizePackToken = (token) => {
  const slug = normalizeTokenToSlug(token);
  if (!slug) return "";

  const normalized = slug
    .replace(/^(\d+)-pack$/, "pack-of-$1")
    .replace(/^pack-?(\d+)$/, "pack-of-$1")
    .replace(/^pack-?of-?(\d+)$/, "pack-of-$1");

  return normalized;
};

const normalizeFilterTokenByKey = (key, rawValue) => {
  if (rawValue === undefined || rawValue === null) return "";

  const attributeKey = String(key || "").toLowerCase().trim();
  let slug = normalizeTokenToSlug(rawValue);
  if (!slug) return "";

  if (attributeKey === "pack") {
    slug = normalizePackToken(slug);
  }

  const lookup = aliasLookups[attributeKey];
  if (lookup && lookup.has(slug)) {
    return lookup.get(slug);
  }

  return slug;
};

const isConfigurableType = (productType) =>
  String(productType || "").trim().toLowerCase() === "configurable";

const allowsMultipleValues = (key, { productType } = {}) => {
  const definition = FILTER_ATTRIBUTE_DEFINITIONS[key];
  if (!definition) return true;

  if (definition.allowMultiple) return true;
  if (
    definition.allowMultipleWhenConfigurable &&
    isConfigurableType(productType)
  ) {
    return true;
  }

  return false;
};

module.exports = {
  FILTER_ATTRIBUTE_KEYS,
  FILTER_ATTRIBUTE_DEFINITIONS,
  normalizeFilterTokenByKey,
  expandCanonicalToAliases,
  allowsMultipleValues,
};
