const Review = require("../../models/Review");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { updateRatings } = require("../../services/ratingService");
const mongoose = require("mongoose");
const logger = require("../../utils/logger");

/**
 * Get purchased products eligible for review
 * Returns products the customer has purchased (delivered orders only)
 */
const getPurchasedProductsForReview = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

    // Find all shipped or delivered orders for this user
    const orders = await Order.find({
      userId,
      orderStatus: { $in: ["shipped", "delivered"] },
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

    // Batch the "already reviewed?" lookup: one query for every product in the
    // user's orders instead of a Review.findOne per line item (N+1).
    const productIds = [
      ...new Set(
        orders
          .flatMap((order) => order.items || [])
          .map((item) => item.variantId?.productId?._id)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];
    const existingReviews = productIds.length
      ? await Review.find({ userId, productId: { $in: productIds } })
      : [];
    const reviewByProduct = new Map(
      existingReviews.map((r) => [String(r.productId), r])
    );

    for (const order of orders) {
      for (const item of order.items) {
        // Check if already reviewed (One review per product rule)
        const productId = item.variantId.productId._id;
        const existingReview = reviewByProduct.get(String(productId)) || null;

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
    logger.error("❌ Error fetching purchased products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Add review for purchased product (authenticated)
 */
const addReview = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { productId, variantId, orderId, rating, review, title } = req.body;

    // Validate required fields
    if (!productId || !orderId || !rating || !title) {
      return res.status(400).json({
        success: false,
        message: "productId, orderId, rating, and title are required",
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

    if (!["shipped", "delivered"].includes(order.orderStatus)) {
      return res.status(403).json({
        success: false,
        message: "You can only review shipped or delivered products",
      });
    }

    // Check if product is part of this order
    const itemInOrder = order.items.find((item) => {
      const pIdMatch = item.productId.toString() === productId;
      const vIdMatch = variantId ? item.variantId === variantId : true;
      return pIdMatch && vIdMatch;
    });

    if (!itemInOrder) {
      return res.status(403).json({
        success: false,
        message: "This product/variant is not part of your order",
      });
    }

    // Check if user already reviewed this product (One Review Per Product)
    const existingReview = await Review.findOne({
      userId,
      productId,
    });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product",
        reviewId: existingReview._id,
        isExistingReview: true,
      });
    }

    const newReview = new Review({
      userId,
      productId,
      variantId,
      orderId,
      rating,
      review,
      title,
    });
    await newReview.save();

    // ⭐ Update ratings
    await updateRatings(productId, variantId);

    // Populate for response
    await newReview.populate([
      { path: "userId", select: "username email" },
      { path: "productId", select: "name images averageRating totalReviews" },
    ]);

    res.status(201).json({
      success: true,
      message: "✅ Review added successfully",
      review: newReview,
    });
  } catch (err) {
    logger.error("❌ Error adding review:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Get all reviews by the logged-in customer
 */
const getMyReviews = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware

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
    logger.error("❌ Error fetching user reviews:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Update customer's own review
 */
const updateMyReview = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const { reviewId } = req.params;
    const { rating, review, title } = req.body;

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
    if (title) existingReview.title = title;

    await existingReview.save();

    // ⭐ Update ratings
    await updateRatings(existingReview.productId, existingReview.variantId);

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
    logger.error("❌ Error updating review:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Delete customer's own review
 */
const deleteMyReview = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
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

    // ⭐ Update ratings after deletion
    await updateRatings(deletedReview.productId, deletedReview.variantId);

    res.status(200).json({
      success: true,
      message: "✅ Review deleted successfully",
    });
  } catch (err) {
    logger.error("❌ Error deleting review:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let targetProductId = productId;

    // Resolve Product ID from SKU or ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const product = await Product.findOne({ sku: productId });
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }
      targetProductId = product._id;
    }

    // Build query with Strict Approval Filter. Cast explicitly so the same
    // filter works for both find() (auto-casts) and aggregate() (does NOT cast).
    const query = {
      productId: new mongoose.Types.ObjectId(targetProductId),
      isApproved: true,
    };

    const reviews = await Review.find(query)
      .populate("userId", "username")
      .populate("variantId", "size color")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Average rating + total count for the approved reviews, computed in Mongo
    // instead of loading the whole review set into memory.
    const [ratingStats] = await Review.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    const total = ratingStats?.count || 0;
    const avgRating = total > 0 ? Number(ratingStats.avg).toFixed(1) : 0;

    // ============================================================
    // Shared reviews: approved reviews from similar designs
    // Priority: designId > subCategories[0] (fallback for baby brand)
    // Same category is enforced as a guardrail. Drafts excluded.
    // ============================================================
    let shared = null;
    const targetProduct = await Product.findById(targetProductId).select(
      "designId category subCategories",
    );

    if (targetProduct && targetProduct.category) {
      let siblingQuery = null;
      let sharedKey = null;
      let sharedType = null;

      if (targetProduct.designId) {
        siblingQuery = {
          designId: targetProduct.designId,
          _id: { $ne: targetProductId },
          category: targetProduct.category,
          status: { $ne: "draft" },
        };
        sharedKey = targetProduct.designId;
        sharedType = "designId";
      } else if (
        Array.isArray(targetProduct.subCategories) &&
        targetProduct.subCategories.length > 0
      ) {
        const primarySubCategory = targetProduct.subCategories[0];
        siblingQuery = {
          subCategories: primarySubCategory,
          _id: { $ne: targetProductId },
          category: targetProduct.category,
          status: { $ne: "draft" },
        };
        sharedKey = String(primarySubCategory);
        sharedType = "subCategory";
      }

      if (siblingQuery) {
        const siblingIds = await Product.find(siblingQuery)
          .select("_id")
          .lean();

        if (siblingIds.length > 0) {
          const sharedReviews = await Review.find({
            productId: { $in: siblingIds.map((p) => p._id) },
            isApproved: true,
          })
            .populate("userId", "username")
            .populate("productId", "name url_key images")
            .sort({ createdAt: -1 })
            .limit(10);

          let sharedAvg = 0;
          if (sharedReviews.length > 0) {
            const sum = sharedReviews.reduce((acc, r) => acc + r.rating, 0);
            sharedAvg = sum / sharedReviews.length;
          }

          shared = {
            ...(sharedType === "designId" ? { designId: sharedKey } : {}),
            key: sharedKey,
            type: sharedType,
            totalReviews: sharedReviews.length,
            averageRating: parseFloat(sharedAvg.toFixed(1)),
            reviews: sharedReviews,
          };
        }
      }
    }

    res.status(200).json({
      success: true,
      totalReviews: total,
      averageRating: parseFloat(avgRating),
      reviews,
      shared,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error("❌ Error fetching product reviews:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

/**
 * Get all reviews for a variant (public)
 */
const getVariantReviews = async (req, res) => {
  try {
    const { variantId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { variantId, isApproved: true };

    const [reviews, statsResult] = await Promise.all([
      Review.find(query)
        .populate("userId", "username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.aggregate([
        { $match: query },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    const stats = statsResult[0];
    const totalReviews = stats?.count || 0;
    const avgRating = totalReviews > 0 ? Number(stats.avg).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      totalReviews,
      averageRating: parseFloat(avgRating),
      reviews,
      pagination: { page, limit, total: totalReviews, pages: Math.ceil(totalReviews / limit) },
    });
  } catch (err) {
    logger.error("❌ Error fetching reviews:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

    const reviews = await Review.find({
      rating: { $gte: minRating },
      isApproved: true,
    })
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
    logger.error("❌ Error fetching top reviews:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
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
  getProductReviews,
  getTopReviews,
};
