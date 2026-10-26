const Review = require("../models/Review");
const Variant = require("../models/Variant");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

/**
 * Update product rating based on all its reviews
 * @param {String} productId - Product ID
 */
const updateProductRating = async (productId) => {
  try {
    // Compute the average/count in Mongo instead of loading every review doc.
    const [stats] = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId), isApproved: true } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    if (!stats || stats.count === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0,
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    const averageRating = parseFloat(Number(stats.avg).toFixed(2));

    await Product.findByIdAndUpdate(productId, {
      averageRating: averageRating,
      totalReviews: stats.count,
    });

    logger.info(
      `✅ Updated product ${productId} rating: ${averageRating} (${stats.count} reviews)`,
    );
    return { averageRating, totalReviews: stats.count };
  } catch (error) {
    logger.error("❌ Error updating product rating:", error);
    throw error;
  }
};

/**
 * Update standalone variant rating if applicable
 * @param {String} variantId - Variant ID
 */
const updateVariantRating = async (variantId) => {
  try {
    // Only proceed if variantId is a valid MongoDB ObjectId (for standalone Variant collection)
    if (!mongoose.Types.ObjectId.isValid(variantId)) return null;

    // Compute the average/count in Mongo instead of loading every review doc.
    // variantId is stored as a string on Review.
    const [stats] = await Review.aggregate([
      { $match: { variantId: String(variantId), isApproved: true } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    if (!stats || stats.count === 0) {
      await Variant.findByIdAndUpdate(variantId, {
        averageRating: 0,
        totalReviews: 0,
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    const averageRating = parseFloat(Number(stats.avg).toFixed(2));

    await Variant.findByIdAndUpdate(variantId, {
      averageRating: averageRating,
      totalReviews: stats.count,
    });

    return { averageRating, totalReviews: stats.count };
  } catch (error) {
    logger.warn(
      "⚠️ Standalone variant update failed (possibly not a standalone variant):",
      variantId,
    );
    return null;
  }
};

/**
 * Update both variant and product ratings
 * @param {String} productId - Product ID (Required)
 * @param {String} variantId - Variant ID (Optional)
 */
const updateRatings = async (productId, variantId) => {
  try {
    if (!productId) {
      logger.warn("⚠️ Cannot update ratings: productId is missing");
      return;
    }

    // Update global product rating (covers all variants)
    await updateProductRating(productId);

    // Update standalone variant if applicable
    if (variantId) {
      await updateVariantRating(variantId);
    }

    return { success: true };
  } catch (error) {
    logger.error("❌ Error updating ratings:", error);
    throw error;
  }
};

module.exports = {
  updateProductRating,
  updateVariantRating,
  updateRatings,
};
