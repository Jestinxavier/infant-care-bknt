const express = require("express");
const router = express.Router();
const { addReview, getVariantReviews } = require("../controllers/review/review");

/**
 * @swagger
 * /api/v1/review/add:
 *   post:
 *     summary: Add a product review
 *     description: Only users who have ordered the product can add a review
 *     tags: [Reviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - variantId
 *               - rating
 *             properties:
 *               userId:
 *                 type: string
 *                 example: 64abc123def456789
 *               variantId:
 *                 type: string
 *                 example: 64abc123def456790
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               comment:
 *                 type: string
 *                 example: Great product! Highly recommend.
 *     responses:
 *       201:
 *         description: Review added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Review added successfully
 *                 review:
 *                   $ref: '#/components/schemas/Review'
 *       400:
 *         description: Validation error or user has not ordered this product
 *       404:
 *         description: Variant not found
 */
// Add review (only for ordered users)
router.post("/add", addReview);

/**
 * @swagger
 * /api/v1/review/{variantId}:
 *   get:
 *     summary: Get all reviews for a variant
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Variant ID
 *         example: 64abc123def456790
 *     responses:
 *       200:
 *         description: Reviews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *       404:
 *         description: No reviews found
 */
// Get all reviews for a variant
router.get("/:variantId", getVariantReviews);

module.exports = router;
