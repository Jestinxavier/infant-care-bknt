const mongoose = require("mongoose");

/**
 * Injectable model lookup, so the chain walker can be unit tested without a
 * database. Set via __setModels({ redirect, collection }).
 */
let redirectModel = null;
let collectionModel = null;

const __setModels = (models) => {
  redirectModel = models.redirect ?? null;
  collectionModel = models.collection ?? null;
};

const resolveModels = () => ({
  redirect: redirectModel ?? mongoose.model("CollectionRedirect"),
  collection: collectionModel ?? mongoose.model("Collection"),
});

/**
 * Persistent record of a collection slug rename.
 *
 * A collection's storefront URL is its slug, so changing the slug (directly, or
 * by renaming and letting the slug regenerate) would otherwise hard-404 every
 * existing link, bookmark, and indexed search result.
 *
 *   fromSlug — the slug that stopped resolving (unique, so it can only map once)
 *   toSlug   — where it should send the visitor now
 *
 * Chains are supported: A→B then B→C leaves {A→B, B→C}. Resolution walks the
 * chain to the final live slug so a rename never needs rewriting old rows.
 */
const collectionRedirectSchema = new mongoose.Schema(
  {
    fromSlug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    toSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    /** Denormalized for admin display; not used for resolution. */
    fromName: { type: String, trim: true, default: null },
    toName: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: "collection_redirects" }
);

// Keep the newest rename first when listing history for the admin UI.
collectionRedirectSchema.index({ updatedAt: -1 });

/**
 * Follows fromSlug → toSlug until it reaches a slug with no redirect record.
 * Guards against cycles (A→B, B→A) with a hop cap.
 *
 * @param {string} slug
 * @param {number} [maxHops]
 * @returns {Promise<string|null>} the final live slug, or null when `slug` is
 *   not a redirect (i.e. it is either live or simply unknown)
 */
async function resolveRedirectChain(slug, maxHops = 10) {
  const start = String(slug || "").trim().toLowerCase();
  if (!start) return null;

  const { redirect } = resolveModels();

  let current = start;
  let followed = false;
  const visited = new Set([start]);

  for (let hop = 0; hop < maxHops; hop += 1) {
    // eslint-disable-next-line no-await-in-loop
    const record = await redirect.findOne({ fromSlug: current }).lean();

    // No record: on the first hop `start` was never a redirect; on any later
    // hop we have walked the chain to its end, and `current` is the live slug.
    if (!record) return followed ? current : null;

    if (visited.has(record.toSlug)) return null; // cycle
    visited.add(record.toSlug);
    current = record.toSlug;
    followed = true;
  }

  return current;
}

if (mongoose.connection.models.CollectionRedirect) {
  delete mongoose.connection.models.CollectionRedirect;
}

const CollectionRedirect =
  mongoose.model("CollectionRedirect", collectionRedirectSchema);

CollectionRedirect.resolveRedirectChain = resolveRedirectChain;
CollectionRedirect.__setModels = __setModels;
CollectionRedirect.__resetModels = () => {
  redirectModel = null;
  collectionModel = null;
};

module.exports = CollectionRedirect;