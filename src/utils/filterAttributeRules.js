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
      gray: ["grey"],
      multicolor: ["multi-color", "multi color"],
    },
  },
  size: {
    allowMultiple: false,
    allowMultipleWhenConfigurable: true,
    aliases: {
      "free-size": ["free size", "freesize", "one size", "onesize"],
      newborn: ["new-born", "new born"],
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
  allowsMultipleValues,
};
