const Review = require("../../models/Review");

/**
 * Get all reviews with pagination and filtering
 */
const getAllReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { rating, isReplied, search, status } = req.query;

    const pipeline = [];

    // 1. Direct Filters
    const matchStage = {};
    if (rating) matchStage.rating = parseInt(rating);
    if (isReplied === "true") matchStage.isReplied = true;
    if (isReplied === "false") matchStage.isReplied = false;
    if (status) matchStage.status = status;

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // 2. Lookups (Joins)
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      { $unwind: "$userId" },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productId",
        },
      },
      { $unwind: "$productId" },
      {
        $lookup: {
          from: "orders",
          localField: "orderId",
          foreignField: "_id",
          as: "orderId",
        },
      },
      {
        $unwind: { path: "$orderId", preserveNullAndEmptyArrays: true },
      },
    );

    // 3. Search Filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { review: { $regex: search, $options: "i" } },
            { reply: { $regex: search, $options: "i" } },
            { "userId.username": { $regex: search, $options: "i" } },
            { "userId.email": { $regex: search, $options: "i" } },
            { "productId.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // 4. Project
    pipeline.push({
      $project: {
        _id: 1,
        rating: 1,
        title: 1,
        review: 1,
        reply: 1,
        isReplied: 1,
        isApproved: 1,
        status: 1,
        repliedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        variantId: 1,
        userId: { _id: 1, username: 1, email: 1 },
        productId: { _id: 1, name: 1, images: 1, slug: 1 },
        orderId: { _id: 1, orderId: 1, totalAmount: 1, placedAt: 1 },
      },
    });

    // 5. Sort
    pipeline.push({ $sort: { createdAt: -1 } });

    // 6. Pagination Facet
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    });

    const results = await Review.aggregate(pipeline);

    const reviews = results[0].data || [];
    const total = results[0].metadata[0] ? results[0].metadata[0].total : 0;

    // Sanitize reviews
    const sanitizedReviews = reviews.map((review) => {
      // Aggregation returns POJO, no .toObject() needed

      if (review.productId && review.productId.images) {
        const processedImages = review.productId.images.map((img) => {
          if (typeof img === "string") return img;
          if (typeof img === "object" && img !== null) {
            const keys = Object.keys(img);
            if (keys.length > 0 && keys.every((k) => !isNaN(parseInt(k)))) {
              try {
                return keys
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map((k) => img[k])
                  .join("");
              } catch (e) {
                return "";
              }
            }
            if (img.url) return img.url;
          }
          return img;
        });
        review.productId.images = processedImages.filter(
          (i) => typeof i === "string" && i.length > 0,
        );
      }

      if (!review.status) {
        review.status = review.isApproved ? "approved" : "pending";
      }

      return review;
    });

    res.status(200).json({
      success: true,
      reviews: sanitizedReviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching reviews (aggregation):", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Reply to a review
 */
const replyToReview = async (req, res) => {
  try {
    const { reviewId, reply } = req.body;

    if (!reviewId || !reply) {
      return res
        .status(400)
        .json({ success: false, message: "Review ID and reply are required" });
    }

    const reviewUpdate = await Review.findByIdAndUpdate(
      reviewId,
      {
        reply,
        isReplied: true,
        repliedAt: new Date(),
      },
      { new: true },
    );

    if (!reviewUpdate) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    res.status(200).json({
      success: true,
      message: "Reply added successfully",
      review: reviewUpdate,
    });
  } catch (error) {
    console.error("❌ Error replying to review:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Approve a review
 */
const approveReview = async (req, res) => {
  try {
    const { reviewId } = req.body;

    if (!reviewId) {
      return res
        .status(400)
        .json({ success: false, message: "Review ID is required" });
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isApproved: true, status: "approved" },
      { new: true },
    );

    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    const { updateRatings } = require("../../services/ratingService");
    await updateRatings(review.productId, review.variantId);

    res.status(200).json({
      success: true,
      message: "Review approved successfully",
      review,
    });
  } catch (error) {
    console.error("❌ Error approving review:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Reject a review
 */
const rejectReview = async (req, res) => {
  try {
    const { reviewId } = req.body;

    if (!reviewId) {
      return res
        .status(400)
        .json({ success: false, message: "Review ID is required" });
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      {
        isApproved: false,
        status: "rejected",
        reply: "",
        isReplied: false,
        repliedAt: null,
      },
      { new: true },
    );

    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // Update ratings to ensure this review is removed from stats
    const { updateRatings } = require("../../services/ratingService");
    await updateRatings(review.productId, review.variantId);

    res.status(200).json({
      success: true,
      message: "Review rejected successfully",
      review,
    });
  } catch (error) {
    console.error("❌ Error rejecting review:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = {
  getAllReviews,
  replyToReview,
  approveReview,
  rejectReview,
};
