const Review = require("../models/Review");
const Variant = require("../models/Variant");
const Product = require("../models/Product");

/**
 * Update variant rating based on all its reviews
 * @param {String} variantId - Variant ID
 */
const updateVariantRating = async (variantId) => {
  try {
    // Get all reviews for this variant
    const reviews = await Review.find({ variantId });

    if (reviews.length === 0) {
      // No reviews, reset to 0
      await Variant.findByIdAndUpdate(variantId, {
        averageRating: 0,
        totalReviews: 0
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = parseFloat((totalRating / reviews.length).toFixed(2));

    // Update variant
    await Variant.findByIdAndUpdate(variantId, {
      averageRating: averageRating,
      totalReviews: reviews.length
    });

    console.log(`✅ Updated variant ${variantId} rating: ${averageRating} (${reviews.length} reviews)`);
    return { averageRating, totalReviews: reviews.length };
  } catch (error) {
    console.error("❌ Error updating variant rating:", error);
    throw error;
  }
};

/**
 * Update product rating based on all its variants' reviews
 * @param {String} productId - Product ID
 */
const updateProductRating = async (productId) => {
  try {
    // Get all variants for this product
    const variants = await Variant.find({ productId });

    if (!variants || variants.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    // Get all reviews for all variants of this product
    const variantIds = variants.map(v => v._id);
    const allReviews = await Review.find({ variantId: { $in: variantIds } });

    if (allReviews.length === 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0
      });
      return { averageRating: 0, totalReviews: 0 };
    }

    // Calculate average rating across all product reviews
    const totalRating = allReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = parseFloat((totalRating / allReviews.length).toFixed(2));

    // Update product
    await Product.findByIdAndUpdate(productId, {
      averageRating: averageRating,
      totalReviews: allReviews.length
    });

    console.log(`✅ Updated product ${productId} rating: ${averageRating} (${allReviews.length} reviews)`);
    return { averageRating, totalReviews: allReviews.length };
  } catch (error) {
    console.error("❌ Error updating product rating:", error);
    throw error;
  }
};

/**
 * Update both variant and product ratings
 * @param {String} variantId - Variant ID
 */
const updateRatings = async (variantId) => {
  try {
    // Update variant rating
    await updateVariantRating(variantId);

    // Get variant to find product ID
    const variant = await Variant.findById(variantId);
    if (variant && variant.productId) {
      // Update product rating
      await updateProductRating(variant.productId);
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error updating ratings:", error);
    throw error;
  }
};

module.exports = {
  updateVariantRating,
  updateProductRating,
  updateRatings
};
