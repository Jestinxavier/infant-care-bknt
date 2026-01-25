const Review = require("../models/Review");
const Variant = require("../models/Variant");
const Product = require("../models/Product");
const mongoose = require("mongoose");

/**
 * Update product rating based on all its reviews
 * @param {String} productId - Product ID
 */
const updateProductRating = async (productId) => {
  try {
    // Get all approved reviews for this product
    const allReviews = await Review.find({ productId, isApproved: true });

    if (allReviews.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0,
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    // Calculate average rating across all product reviews
    const totalRating = allReviews.reduce(
      (sum, review) => sum + review.rating,
      0,
    );
    const averageRating = parseFloat(
      (totalRating / allReviews.length).toFixed(2),
    );

    // Update product
    await Product.findByIdAndUpdate(productId, {
      averageRating: averageRating,
      totalReviews: allReviews.length,
    });

    console.log(
      `✅ Updated product ${productId} rating: ${averageRating} (${allReviews.length} reviews)`,
    );
    return { averageRating, totalReviews: allReviews.length };
  } catch (error) {
    console.error("❌ Error updating product rating:", error);
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

    // Get all approved reviews for this variant
    const reviews = await Review.find({ variantId, isApproved: true });

    if (reviews.length === 0) {
      await Variant.findByIdAndUpdate(variantId, {
        averageRating: 0,
        totalReviews: 0,
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = parseFloat((totalRating / reviews.length).toFixed(2));

    await Variant.findByIdAndUpdate(variantId, {
      averageRating: averageRating,
      totalReviews: reviews.length,
    });

    return { averageRating, totalReviews: reviews.length };
  } catch (error) {
    console.warn(
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
      console.warn("⚠️ Cannot update ratings: productId is missing");
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
    console.error("❌ Error updating ratings:", error);
    throw error;
  }
};

module.exports = {
  updateProductRating,
  updateVariantRating,
  updateRatings,
};
