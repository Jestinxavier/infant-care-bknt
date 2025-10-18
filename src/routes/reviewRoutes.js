const express = require("express");
const router = express.Router();
const { 
  getPurchasedProductsForReview,
  addReview, 
  getMyReviews,
  updateMyReview,
  deleteMyReview,
  getVariantReviews 
} = require("../controllers/review/review");
const verifyToken = require("../middlewares/authMiddleware");

/**
 * @swagger
 * components:
 *   schemas:
 *     Review:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 64abc123def456789
 *         userId:
 *           type: string
 *           example: 64abc123def456789
 *         variantId:
 *           type: string
 *           example: 64abc123def456790
 *         orderId:
 *           type: string
 *           example: 64abc123def456791
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *         review:
 *           type: string
 *           example: Excellent product! Highly recommended.
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/review/my-purchases:
 *   get:
 *     summary: Get purchased products eligible for review
 *     description: Returns all products the authenticated customer has purchased (delivered orders) with review status
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Purchased products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalPurchased:
 *                   type: number
 *                   example: 5
 *                 purchasedProducts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderId:
 *                         type: string
 *                       orderDate:
 *                         type: string
 *                         format: date-time
 *                       variantId:
 *                         type: string
 *                       productId:
 *                         type: string
 *                       productName:
 *                         type: string
 *                       productImage:
 *                         type: string
 *                       variantDetails:
 *                         type: object
 *                         properties:
 *                           size:
 *                             type: string
 *                           color:
 *                             type: string
 *                           price:
 *                             type: number
 *                       quantity:
 *                         type: number
 *                       isReviewed:
 *                         type: boolean
 *                       review:
 *                         $ref: '#/components/schemas/Review'
 *       401:
 *         description: Unauthorized - No token provided
 */
router.get("/my-purchases", verifyToken, getPurchasedProductsForReview);

/**
 * @swagger
 * /api/v1/review/add:
 *   post:
 *     summary: Add a review for purchased product
 *     description: Only authenticated users who have received the product can add a review
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variantId
 *               - orderId
 *               - rating
 *             properties:
 *               variantId:
 *                 type: string
 *                 example: 64abc123def456790
 *               orderId:
 *                 type: string
 *                 example: 64abc123def456791
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review:
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
 *                   example: ✅ Review added successfully
 *                 review:
 *                   $ref: '#/components/schemas/Review'
 *       400:
 *         description: Validation error or already reviewed
 *       403:
 *         description: Product not purchased or not delivered yet
 *       401:
 *         description: Unauthorized
 */
router.post("/add", verifyToken, addReview);

/**
 * @swagger
 * /api/v1/review/my-reviews:
 *   get:
 *     summary: Get all reviews by the authenticated customer
 *     description: Returns all reviews created by the logged-in user
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
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
 *                 totalReviews:
 *                   type: number
 *                   example: 3
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *       401:
 *         description: Unauthorized
 */
router.get("/my-reviews", verifyToken, getMyReviews);

/**
 * @swagger
 * /api/v1/review/my-review/{reviewId}:
 *   put:
 *     summary: Update customer's own review
 *     description: Update a review created by the authenticated user
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *         example: 64abc123def456789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               review:
 *                 type: string
 *                 example: Updated review text
 *     responses:
 *       200:
 *         description: Review updated successfully
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
 *                   example: ✅ Review updated successfully
 *                 review:
 *                   $ref: '#/components/schemas/Review'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Review not found or unauthorized
 *       401:
 *         description: Unauthorized
 */
router.put("/my-review/:reviewId", verifyToken, updateMyReview);

/**
 * @swagger
 * /api/v1/review/my-review/{reviewId}:
 *   delete:
 *     summary: Delete customer's own review
 *     description: Delete a review created by the authenticated user
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Review deleted successfully
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
 *                   example: ✅ Review deleted successfully
 *       404:
 *         description: Review not found or unauthorized
 *       401:
 *         description: Unauthorized
 */
router.delete("/my-review/:reviewId", verifyToken, deleteMyReview);

/**
 * @swagger
 * /api/v1/review/variant/{variantId}:
 *   get:
 *     summary: Get all reviews for a variant (Public)
 *     description: Get all reviews for a specific product variant with average rating
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
 *                 totalReviews:
 *                   type: number
 *                   example: 15
 *                 averageRating:
 *                   type: number
 *                   example: 4.3
 *                 reviews:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Review'
 *       500:
 *         description: Server error
 */
router.get("/variant/:variantId", getVariantReviews);

module.exports = router;
