const Collection = require("../../models/Collection");
const CollectionRedirect = require("../../models/CollectionRedirect");
const Product = require("../../models/Product");
const escapeRegex = require("../../utils/escapeRegex");
const {
  invalidateProductCatalogCaches,
} = require("../../utils/productCacheInvalidation");
const {
  generateSlug,
  generateUniqueUrlKey,
  validateUrlKey,
} = require("../../utils/slugGenerator");

const normalizeSlug = (value) => generateSlug(String(value || ""));
const HEX_BADGE_COLOR_REGEX = /^#[0-9A-F]{6}$/;

/**
 * Uniqueness probe for generateUniqueUrlKey. excludeId lets an update keep its
 * own slug instead of colliding with itself.
 */
const collectionSlugExists = async (slug, excludeId = null) =>
  !!(await Collection.exists(
    excludeId ? { slug, _id: { $ne: excludeId } } : { slug }
  ));

/**
 * Persist oldSlug → newSlug so existing storefront links survive a rename.
 *
 * Three cases handled here:
 *  - old slug is being reused by a *different* live collection → drop the
 *    redirect (the live collection owns that URL).
 *  - new slug is itself a retired slug → point straight at the live one, so
 *    chains collapse instead of growing.
 *  - ordinary rename → record it.
 */
const recordSlugRedirect = async ({ oldSlug, newSlug, fromName, toName }) => {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return;

  // A live collection now owns this slug — it must resolve to itself, not redirect.
  const liveOwner = await Collection.findOne({ slug: oldSlug })
    .select("_id")
    .lean();
  if (liveOwner) {
    await CollectionRedirect.deleteOne({ fromSlug: oldSlug });
    return;
  }

  const finalTarget = (await CollectionRedirect.resolveRedirectChain(newSlug)) || newSlug;

  await CollectionRedirect.findOneAndUpdate(
    { fromSlug: oldSlug },
    { $set: { fromSlug: oldSlug, toSlug: finalTarget, fromName, toName } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const buildCollectionPath = (slug) =>
  slug ? `/collection/${slug}` : "/collection";

const serializeCollection = (item) => ({
  _id: item._id.toString(),
  name: item.name,
  slug: item.slug,
  path: buildCollectionPath(item.slug),
  badgeLabel: item.badgeLabel || null,
  badgeColor: item.badgeColor || null,
  badgeLabelColor: item.badgeLabelColor || null,
});

const normalizeHexColor = (value, fieldLabel) => {
  if (value === undefined) return { hasValue: false, value: undefined };
  if (value === null) return { hasValue: true, value: null };

  const trimmed = String(value).trim();
  if (!trimmed) return { hasValue: true, value: null };

  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const normalized = withHash.toUpperCase();

  if (!HEX_BADGE_COLOR_REGEX.test(normalized)) {
    return {
      hasValue: true,
      error: `${fieldLabel} must be a valid hex code in #RRGGBB format`,
    };
  }

  return { hasValue: true, value: normalized };
};

const listCollections = async (req, res) => {
  try {
    const { q } = req.query || {};
    const filter = {};
    if (q && String(q).trim()) {
      const regex = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ name: regex }, { slug: regex }];
    }

    const items = await Collection.find(filter).sort({ name: 1 }).lean();
    return res.status(200).json({
      success: true,
      items: items.map(serializeCollection),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch collections",
          });
  }
};

const createCollection = async (req, res) => {
  try {
    const { name, slug, badgeLabel, badgeColor, badgeLabelColor } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Collection name is required",
      });
    }

    const trimmedName = String(name).trim();
    const providedSlug = normalizeSlug(slug);

    let finalSlug;
    if (providedSlug) {
      // An explicit slug is a deliberate choice — reject it rather than
      // silently rewriting what the admin typed.
      const existing = await Collection.findOne({ slug: providedSlug }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Collection with slug "${providedSlug}" already exists`,
        });
      }
      finalSlug = providedSlug;
    } else {
      // generateUniqueUrlKey throws on an unslugifiable title, so check first.
      const slugSource = trimmedName.replace(/_/g, " ");
      if (!normalizeSlug(slugSource)) {
        return res.status(400).json({
          success: false,
          message:
            "Collection name must contain at least one letter or number to generate a slug",
        });
      }

      // Auto-generated: de-dupe with a numeric suffix instead of 409-ing, so
      // creating "Baby Essentials" twice just yields "baby-essentials-2".
      // Strip "_" up front: generateSlug keeps it (it is a \w char) but
      // validateUrlKey rejects it, so a name like "Baby_Toothbrush" would
      // otherwise generate a slug that can never validate.
      finalSlug = await generateUniqueUrlKey(slugSource, collectionSlugExists);
    }

    // Applies to both paths: a short name like "A" auto-generates a 1-char
    // slug, which would violate the same rule an explicit slug is held to.
    const finalSlugValidation = validateUrlKey(finalSlug);
    if (!finalSlugValidation.valid) {
      return res.status(400).json({
        success: false,
        message: finalSlugValidation.error,
      });
    }

    const normalizedBadgeColor = normalizeHexColor(badgeColor, "Badge color");
    if (normalizedBadgeColor.error) {
      return res.status(400).json({
        success: false,
        message: normalizedBadgeColor.error,
      });
    }
    const normalizedBadgeLabelColor = normalizeHexColor(
      badgeLabelColor,
      "Badge label color"
    );
    if (normalizedBadgeLabelColor.error) {
      return res.status(400).json({
        success: false,
        message: normalizedBadgeLabelColor.error,
      });
    }

    const created = await Collection.create({
      name: trimmedName,
      slug: finalSlug,
      badgeLabel:
        badgeLabel === undefined || badgeLabel === null || badgeLabel === ""
          ? null
          : String(badgeLabel).trim(),
      badgeColor: normalizedBadgeColor.value ?? null,
      badgeLabelColor: normalizedBadgeLabelColor.value ?? null,
    });

    // This slug may have been retired by an earlier rename. Now that a live
    // collection owns it, any redirect pointing at it is stale and would send
    // visitors to the wrong place.
    await CollectionRedirect.deleteMany({ fromSlug: finalSlug });

    return res.status(201).json({
      success: true,
      item: serializeCollection(created),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create collection",
          });
  }
};

const updateCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, badgeLabel, badgeColor, badgeLabelColor } = req.body || {};
    const existing = await Collection.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    // Captured before mutation so the redirect row can label the rename.
    const previousSlug = existing.slug;
    const previousName = existing.name;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({
          success: false,
          message: "Collection name cannot be empty",
        });
      }
      existing.name = trimmed;
    }

    if (slug !== undefined) {
      const providedSlug = normalizeSlug(slug);
      if (!providedSlug) {
        return res.status(400).json({
          success: false,
          message:
            "Collection slug cannot be empty — it must contain at least one letter or number",
        });
      }

      const slugValidation = validateUrlKey(providedSlug);
      if (!slugValidation.valid) {
        return res.status(400).json({
          success: false,
          message: slugValidation.error,
        });
      }

      if (providedSlug !== existing.slug) {
        const dup = await Collection.findOne({
          slug: providedSlug,
          _id: { $ne: existing._id },
        }).lean();
        if (dup) {
          return res.status(409).json({
            success: false,
            message: `Collection with slug "${providedSlug}" already exists`,
          });
        }

        const oldSlug = existing.slug;
        existing.slug = providedSlug;

        // Keep product references consistent when slug changes.
        await Product.updateMany(
          { collections: oldSlug },
          { $set: { "collections.$[col]": providedSlug } },
          { arrayFilters: [{ col: oldSlug }] }
        );
        await Product.updateMany(
          { badgeCollection: oldSlug },
          { $set: { badgeCollection: providedSlug } }
        );

        // updateMany bypasses Mongoose middleware, so product catalogue caches
        // still hold the old slug and would keep serving stale collection
        // metadata until their TTL expires.
        await invalidateProductCatalogCaches("collection slug renamed");
      }
    }

    if (badgeLabel !== undefined) {
      existing.badgeLabel =
        badgeLabel === null || String(badgeLabel).trim() === ""
          ? null
          : String(badgeLabel).trim();
    }
    if (badgeColor !== undefined) {
      const normalizedBadgeColor = normalizeHexColor(badgeColor, "Badge color");
      if (normalizedBadgeColor.error) {
        return res.status(400).json({
          success: false,
          message: normalizedBadgeColor.error,
        });
      }
      existing.badgeColor = normalizedBadgeColor.value;
    }
    if (badgeLabelColor !== undefined) {
      const normalizedBadgeLabelColor = normalizeHexColor(
        badgeLabelColor,
        "Badge label color"
      );
      if (normalizedBadgeLabelColor.error) {
        return res.status(400).json({
          success: false,
          message: normalizedBadgeLabelColor.error,
        });
      }
      existing.badgeLabelColor = normalizedBadgeLabelColor.value;
    }

    await existing.save();

    // Must run after save(): the helper checks whether a live collection still
    // owns previousSlug, and until now this one did.
    await recordSlugRedirect({
      oldSlug: previousSlug,
      newSlug: existing.slug,
      fromName: previousName,
      toName: existing.name,
    });

    // Renaming onto a previously-retired slug reclaims it, so drop any stale
    // redirect that still claims to own it.
    await CollectionRedirect.deleteMany({ fromSlug: existing.slug });

    return res.status(200).json({
      success: true,
      item: serializeCollection(existing),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update collection",
          });
  }
};

const deleteCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Collection.findById(id).lean();
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    const inUse = await Product.exists({
      $or: [{ collections: existing.slug }, { badgeCollection: existing.slug }],
    });
    if (inUse) {
      return res.status(400).json({
        success: false,
        message:
          "Collection is in use by products. Remove it from products before deleting.",
      });
    }

    await Collection.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      message: "Collection deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete collection",
          });
  }
};

/**
 * Public storefront lookup by slug.
 *
 * Returns the collection for a *live* slug. When `slug` has been retired by a
 * rename, responds 200 with `redirectedTo` set to the final live slug so the
 * storefront can issue a 301/308 instead of a 404.
 */
const getCollectionBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const normalized = normalizeSlug(slug);
    if (!normalized) {
      return res.status(404).json({
        success: false,
        message: "Collection not found",
      });
    }

    const collection = await Collection.findOne({ slug: normalized }).lean();

    if (collection) {
      return res.status(200).json({
        success: true,
        collection: serializeCollection(collection),
        redirectedTo: null,
      });
    }

    // Not live — maybe a renamed slug. Follow the chain to a final target.
    const followed = await followRedirect(normalized);
    if (followed) {
      return res.status(200).json({
        success: true,
        collection: serializeCollection(followed.collection),
        redirectedTo: followed.slug,
      });
    }

    return res.status(404).json({
      success: false,
      message: "Collection not found",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load collection",
    });
  }
};

/**
 * Follows a slug to the live collection it now resolves to.
 * Returns null when the slug is not a redirect.
 */
const followRedirect = async (slug) => {
  const finalSlug = await CollectionRedirect.resolveRedirectChain(slug);
  if (!finalSlug || finalSlug === slug) return null;

  const target = await Collection.findOne({ slug: finalSlug }).lean();
  return target ? { collection: target, slug: finalSlug } : null;
};

/**
 * Admin: recent slug renames, newest first.
 */
const listCollectionRedirects = async (req, res) => {
  try {
    const items = await CollectionRedirect.find()
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({
      success: true,
      items: items.map((item) => ({
        _id: item._id.toString(),
        fromSlug: item.fromSlug,
        toSlug: item.toSlug,
        fromName: item.fromName || null,
        toName: item.toName || null,
        path: buildCollectionPath(item.fromSlug),
        targetPath: buildCollectionPath(item.toSlug),
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load collection redirects",
    });
  }
};

/**
 * Admin: drop a redirect so its old slug starts 404ing again.
 */
const deleteCollectionRedirect = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await CollectionRedirect.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Redirect not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Redirect deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete redirect",
    });
  }
};

module.exports = {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionBySlug,
  listCollectionRedirects,
  deleteCollectionRedirect,
};
