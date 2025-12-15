const Review = require("../../models/Review");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { updateRatings } = require("../../services/ratingService");

/**
 * Get purchased products eligible for review
 * Returns products the customer has purchased (delivered orders only)
 */
const getPurchasedProductsForReview = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

    // Find all delivered orders for this user
    const orders = await Order.find({
      userId,
      orderStatus: "delivered",
    }).populate({
      path: "items.variantId",
      populate: { path: "productId", select: "name images category" },
    });

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No purchased products found",
        purchasedProducts: [],
      });
    }

    // Collect all variant-order combinations
    const purchasedItems = [];
    for (const order of orders) {
      for (const item of order.items) {
        // Check if already reviewed
        const existingReview = await Review.findOne({
          userId,
          variantId: item.variantId._id,
          orderId: order._id,
        });

        purchasedItems.push({
          orderId: order._id,
          orderDate: order.placedAt,
          variantId: item.variantId._id,
          productId: item.variantId.productId._id,
          productName: item.variantId.productId.name,
          productImage: item.variantId.productId.images?.[0] || null,
          variantDetails: {
            size: item.variantId.size,
            color: item.variantId.color,
            price: item.price,
          },
          quantity: item.quantity,
          isReviewed: !!existingReview,
          review: existingReview || null,
        });
      }
    }

    res.status(200).json({
      success: true,
      totalPurchased: purchasedItems.length,
      purchasedProducts: purchasedItems,
    });
  } catch (err) {
    console.error("❌ Error fetching purchased products:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

/**
 * Add review for purchased product (authenticated)
 */
const addReview = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware
    const { variantId, orderId, rating, review } = req.body;

    // Validate required fields
    if (!variantId || !orderId || !rating) {
      return res.status(400).json({
        success: false,
        message: "variantId, orderId, and rating are required",
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Check if order exists, belongs to the user, and is delivered
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res
        .status(403)
        .json({ success: false, message: "Order not found or unauthorized" });
    }

    if (order.orderStatus !== "delivered") {
      return res.status(403).json({
        success: false,
        message: "You can only review delivered products",
      });
    }

    // Check if variant is part of this order
    const variantInOrder = order.items.find(
      (item) => item.variantId.toString() === variantId
    );
    if (!variantInOrder) {
      return res.status(403).json({
        success: false,
        message: "This variant is not part of your order",
      });
    }

    // Check if user already reviewed this variant in this order
    const existingReview = await Review.findOne({ userId, variantId, orderId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const newReview = new Review({
      userId,
      variantId,
      orderId,
      rating,
      review,
    });
    await newReview.save();

    // ⭐ Update variant and product ratings
    await updateRatings(variantId);

    // Populate for response
    await newReview.populate([
      { path: "userId", select: "username email" },
      {
        path: "variantId",
        populate: {
          path: "productId",
          select: "name images averageRating totalReviews",
        },
      },
    ]);

    res.status(201).json({
      success: true,
      message: "✅ Review added successfully",
      review: newReview,
    });
  } catch (err) {
    console.error("❌ Error adding review:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

/**
 * Get all reviews by the logged-in customer
 */
const getMyReviews = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

    const reviews = await Review.find({ userId })
      .populate({
        path: "variantId",
        populate: { path: "productId", select: "name images category" },
      })
      .populate("orderId", "placedAt orderStatus")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalReviews: reviews.length,
      reviews,
    });
  } catch (err) {
    console.error("❌ Error fetching user reviews:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

/**
 * Update customer's own review
 */
const updateMyReview = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware
    const { reviewId } = req.params;
    const { rating, review } = req.body;

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Find review and check ownership
    const existingReview = await Review.findOne({ _id: reviewId, userId });
    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you don't have permission to update it",
      });
    }

    // Update review
    if (rating) existingReview.rating = rating;
    if (review !== undefined) existingReview.review = review;

    await existingReview.save();

    // ⭐ Update variant and product ratings
    await updateRatings(existingReview.variantId);

    // Populate for response
    await existingReview.populate([
      {
        path: "variantId",
        populate: {
          path: "productId",
          select: "name images averageRating totalReviews",
        },
      },
      { path: "orderId", select: "placedAt" },
    ]);

    res.status(200).json({
      success: true,
      message: "✅ Review updated successfully",
      review: existingReview,
    });
  } catch (err) {
    console.error("❌ Error updating review:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

/**
 * Delete customer's own review
 */
const deleteMyReview = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware
    const { reviewId } = req.params;

    // Find and delete review (only if owned by user)
    const deletedReview = await Review.findOneAndDelete({
      _id: reviewId,
      userId,
    });
    if (!deletedReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you don't have permission to delete it",
      });
    }

    // ⭐ Update variant and product ratings after deletion
    await updateRatings(deletedReview.variantId);

    res.status(200).json({
      success: true,
      message: "✅ Review deleted successfully",
    });
  } catch (err) {
    console.error("❌ Error deleting review:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

/**
 * Get all reviews for a variant (public)
 */
const getVariantReviews = async (req, res) => {
  try {
    const { variantId } = req.params;

    const reviews = await Review.find({ variantId })
      .populate("userId", "username")
      .sort({ createdAt: -1 });

    // Calculate average rating
    const avgRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : 0;

    res.status(200).json({
      success: true,
      totalReviews: reviews.length,
      averageRating: parseFloat(avgRating),
      reviews,
    });
  } catch (err) {
    console.error("❌ Error fetching reviews:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};
/**
 * Get top reviews for homepage display (public)
 * Returns highest-rated reviews with user info
 */
const getTopReviews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const minRating = parseInt(req.query.minRating) || 4; // Default to 4+ star reviews

    const reviews = await Review.find({ rating: { $gte: minRating } })
      .populate("userId", "username firstName lastName")
      .populate({
        path: "variantId",
        populate: { path: "productId", select: "name images" },
      })
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit);

    // Format reviews for CMS widget
    const formattedReviews = reviews.map((review) => ({
      id: review._id,
      name: review.userId?.firstName
        ? `${review.userId.firstName} ${review.userId.lastName || ""}`.trim()
        : review.userId?.username || "Anonymous",
      rating: review.rating,
      date: review.createdAt.toISOString().split("T")[0],
      review: review.review || "",
      productName: review.variantId?.productId?.name || null,
      productImage: review.variantId?.productId?.images?.[0] || null,
    }));

    res.status(200).json({
      success: true,
      totalReviews: formattedReviews.length,
      reviews: formattedReviews,
    });
  } catch (err) {
    console.error("❌ Error fetching top reviews:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Internal Server Error",
        error: err.message,
      });
  }
};

module.exports = {
  getPurchasedProductsForReview,
  addReview,
  getMyReviews,
  updateMyReview,
  deleteMyReview,
  getVariantReviews,
  getTopReviews,
};
