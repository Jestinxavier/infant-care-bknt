const Collection = require("../models/Collection");
const { generateSlug } = require("./slugGenerator");

const normalizeCollectionSlug = (value) => generateSlug(String(value || ""));

const parseCollectionsInput = (input) => {
  if (input == null || input === "") return [];

  if (Array.isArray(input)) {
    return input
      .map((value) => normalizeCollectionSlug(value))
      .filter(Boolean);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Accept JSON array, pipe-separated, or comma-separated input.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((value) => normalizeCollectionSlug(value))
            .filter(Boolean);
        }
      } catch (_) {}
    }

    const splitter = trimmed.includes("|") ? /\s*\|\s*/ : /\s*,\s*/;
    return trimmed
      .split(splitter)
      .map((value) => normalizeCollectionSlug(value))
      .filter(Boolean);
  }

  return [];
};

const uniquePreserveOrder = (values) => {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const validateCollectionsAndBadge = async ({ collections, badgeCollection }) => {
  const normalizedCollections = uniquePreserveOrder(
    parseCollectionsInput(collections)
  );
  const normalizedBadge = badgeCollection
    ? normalizeCollectionSlug(badgeCollection)
    : null;

  const allToCheck = uniquePreserveOrder(
    normalizedBadge
      ? [...normalizedCollections, normalizedBadge]
      : [...normalizedCollections]
  );

  if (allToCheck.length > 0) {
    const existing = await Collection.find({ slug: { $in: allToCheck } })
      .select("slug")
      .lean();
    const existingSet = new Set(existing.map((item) => item.slug));
    const missing = allToCheck.filter((slug) => !existingSet.has(slug));
    if (missing.length > 0) {
      const error = new Error(
        `Unknown collection slug(s): ${missing.join(", ")}`
      );
      error.code = "INVALID_COLLECTIONS";
      throw error;
    }
  }

  let finalBadge = normalizedBadge;
  if (finalBadge && !normalizedCollections.includes(finalBadge)) {
    const error = new Error("badgeCollection must be one of product collections");
    error.code = "INVALID_BADGE_COLLECTION";
    throw error;
  }

  if (normalizedCollections.length === 0) {
    finalBadge = null;
  }

  return {
    collections: normalizedCollections,
    badgeCollection: finalBadge,
  };
};

const buildCollectionMetaMap = async (slugs) => {
  const uniqueSlugs = uniquePreserveOrder(parseCollectionsInput(slugs));
  if (uniqueSlugs.length === 0) return new Map();
  const docs = await Collection.find({ slug: { $in: uniqueSlugs } }).lean();
  const map = new Map();
  docs.forEach((doc) => {
    map.set(doc.slug, {
      slug: doc.slug,
      name: doc.name,
      badgeLabel: doc.badgeLabel || null,
      badgeColor: doc.badgeColor || null,
      badgeLabelColor: doc.badgeLabelColor || null,
    });
  });
  return map;
};

module.exports = {
  normalizeCollectionSlug,
  parseCollectionsInput,
  uniquePreserveOrder,
  validateCollectionsAndBadge,
  buildCollectionMetaMap,
};
