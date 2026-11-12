const mongoose = require("mongoose");
const Category = require("../../models/Category");
const logger = require("../../utils/logger");
const { cacheDel } = require("../../utils/redisCache");

/**
 * PUT /admin/categories/reorder
 * Body: { parentId: string | null, orderedIds: string[] }
 *
 * Sets the display order of one parent's subcategories (or of the top-level
 * categories when parentId is null). orderedIds must be exactly that group,
 * in the new order; each gets displayOrder = its position. The storefront's
 * category page and homepage grid list categories in this order.
 */
const reorderCategories = async (req, res) => {
  try {
    const { parentId = null, orderedIds } = req.body || {};
    const isId = (v) => typeof v === "string" && mongoose.Types.ObjectId.isValid(v);

    if (parentId !== null && !isId(parentId)) {
      return res.status(400).json({ success: false, message: "Invalid parent category" });
    }
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      orderedIds.length > 500 ||
      !orderedIds.every(isId) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      return res.status(400).json({ success: false, message: "orderedIds must be a list of unique category ids" });
    }

    // The group being reordered, as it is now
    const siblings = await Category.find({ parentCategory: parentId }).select("_id").lean();
    const siblingIds = new Set(siblings.map((c) => String(c._id)));
    const sameGroup =
      siblingIds.size === orderedIds.length && orderedIds.every((id) => siblingIds.has(id));
    if (!sameGroup) {
      // A category was added, moved or deleted meanwhile: ask for a fresh list
      return res.status(409).json({
        success: false,
        message: "The categories changed since you opened this list. Reload and try again.",
      });
    }

    await Category.bulkWrite(
      orderedIds.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { displayOrder: index } } },
      })),
      { ordered: false },
    );

    await cacheDel("categories");
    try {
      const { triggerRevalidation } = require("../../services/revalidateService");
      await triggerRevalidation({ tag: "group:categories" });
    } catch (revalErr) {
      logger.warn("⚠️ [Category] Failed to trigger storefront revalidation:", revalErr.message);
    }

    logger.info("[Category] Order updated", { parentId, count: orderedIds.length, by: req.user?.id });
    return res.status(200).json({ success: true, message: "Order saved" });
  } catch (error) {
    logger.error("❌ Error reordering categories:", error);
    return res.status(500).json({ success: false, message: "Failed to save the order" });
  }
};

module.exports = reorderCategories;
