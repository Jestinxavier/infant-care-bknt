const Collection = require("../../models/Collection");
const Product = require("../../models/Product");
const { generateSlug } = require("../../utils/slugGenerator");

const normalizeSlug = (value) => generateSlug(String(value || ""));
const HEX_BADGE_COLOR_REGEX = /^#[0-9A-F]{6}$/;

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
      const regex = new RegExp(String(q).trim(), "i");
      filter.$or = [{ name: regex }, { slug: regex }];
    }

    const items = await Collection.find(filter).sort({ name: 1 }).lean();
    return res.status(200).json({
      success: true,
      items: items.map((item) => ({
        _id: item._id.toString(),
        name: item.name,
        slug: item.slug,
        badgeLabel: item.badgeLabel || null,
        badgeColor: item.badgeColor || null,
        badgeLabelColor: item.badgeLabelColor || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch collections",
      error: error.message,
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

    const finalSlug = normalizeSlug(slug || name);
    if (!finalSlug) {
      return res.status(400).json({
        success: false,
        message: "Collection slug is required",
      });
    }

    const existing = await Collection.findOne({ slug: finalSlug }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Collection with slug "${finalSlug}" already exists`,
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
      name: String(name).trim(),
      slug: finalSlug,
      badgeLabel:
        badgeLabel === undefined || badgeLabel === null || badgeLabel === ""
          ? null
          : String(badgeLabel).trim(),
      badgeColor: normalizedBadgeColor.value ?? null,
      badgeLabelColor: normalizedBadgeLabelColor.value ?? null,
    });

    return res.status(201).json({
      success: true,
      item: {
        _id: created._id.toString(),
        name: created.name,
        slug: created.slug,
        badgeLabel: created.badgeLabel || null,
        badgeColor: created.badgeColor || null,
        badgeLabelColor: created.badgeLabelColor || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create collection",
      error: error.message,
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
      const finalSlug = normalizeSlug(slug || existing.name);
      if (!finalSlug) {
        return res.status(400).json({
          success: false,
          message: "Collection slug cannot be empty",
        });
      }
      if (finalSlug !== existing.slug) {
        const dup = await Collection.findOne({
          slug: finalSlug,
          _id: { $ne: existing._id },
        }).lean();
        if (dup) {
          return res.status(409).json({
            success: false,
            message: `Collection with slug "${finalSlug}" already exists`,
          });
        }

        const oldSlug = existing.slug;
        existing.slug = finalSlug;

        // Keep product references consistent when slug changes.
        await Product.updateMany(
          { collections: oldSlug },
          { $set: { "collections.$[col]": finalSlug } },
          { arrayFilters: [{ col: oldSlug }] }
        );
        await Product.updateMany(
          { badgeCollection: oldSlug },
          { $set: { badgeCollection: finalSlug } }
        );
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
    return res.status(200).json({
      success: true,
      item: {
        _id: existing._id.toString(),
        name: existing.name,
        slug: existing.slug,
        badgeLabel: existing.badgeLabel || null,
        badgeColor: existing.badgeColor || null,
        badgeLabelColor: existing.badgeLabelColor || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update collection",
      error: error.message,
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
      error: error.message,
    });
  }
};

module.exports = {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
};
