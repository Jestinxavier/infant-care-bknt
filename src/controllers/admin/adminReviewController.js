const Review = require("../../models/Review");

/**
 * Get all reviews with pagination and filtering
 */
const getAllReviews = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { rating, isReplied, search } = req.query;

        const query = {};

        if (rating) query.rating = parseInt(rating);
        if (isReplied === "true") query.isReplied = true;
        if (isReplied === "false") query.isReplied = false;

        // Search by product name or review text (complex due to refs, but let's do basic first)
        if (search) {
            query.$or = [
                { review: { $regex: search, $options: "i" } },
                { reply: { $regex: search, $options: "i" } }
            ];
        }

        const reviews = await Review.find(query)
            .populate("userId", "username email")
            .populate("productId", "name images slug")
            .populate("orderId", "orderId totalAmount placedAt")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Review.countDocuments(query);

        res.status(200).json({
            success: true,
            reviews,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("❌ Error fetching admin reviews:", error);
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
            return res.status(400).json({ success: false, message: "Review ID and reply are required" });
        }

        const reviewUpdate = await Review.findByIdAndUpdate(
            reviewId,
            {
                reply,
                isReplied: true,
                repliedAt: new Date()
            },
            { new: true }
        );

        if (!reviewUpdate) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }

        res.status(200).json({
            success: true,
            message: "Reply added successfully",
            review: reviewUpdate
        });
    } catch (error) {
        console.error("❌ Error replying to review:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    getAllReviews,
    replyToReview
};
