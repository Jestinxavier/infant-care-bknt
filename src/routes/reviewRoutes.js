const express = require("express");
const router = express.Router();
const { addReview, getVariantReviews } = require("../controllers/review/review");

// Add review (only for ordered users)
router.post("/add", addReview);

// Get all reviews for a variant
router.get("/:variantId", getVariantReviews);

module.exports = router;
