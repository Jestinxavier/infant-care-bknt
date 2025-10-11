const Review = require("../../models/Review");
const Order = require("../../models/Order");

const addReview = async (req, res) => {
  try {
    const { userId, variantId, orderId, rating, review } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
    }

    // Check if order exists and belongs to the user
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(403).json({ success: false, message: "You can only review your own orders" });
    }

    // Check if variant is part of this order
    const variantInOrder = order.items.find(item => item.variantId.toString() === variantId);
    if (!variantInOrder) {
      return res.status(403).json({ success: false, message: "You can only review variants you have ordered" });
    }

    // Check if user already reviewed this variant in this order
    const existingReview = await Review.findOne({ userId, variantId, orderId });
    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this variant for this order" });
    }

    const newReview = new Review({ userId, variantId, orderId, rating, review });
    await newReview.save();

    res.status(201).json({ success: true, message: "✅ Review added successfully", review: newReview });
  } catch (err) {
    console.error("❌ Error adding review:", err);
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};

const getVariantReviews = async (req, res) => {
  try {
    const { variantId } = req.params;

    const reviews = await Review.find({ variantId }).populate("userId", "username");

    res.status(200).json({ success: true, reviews });
  } catch (err) {
    console.error("❌ Error fetching reviews:", err);
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
  }
};

module.exports = { addReview, getVariantReviews };
