const express = require("express");
const { parser } = require("../config/cloudinary");
const verifyToken = require("../middlewares/authMiddleware");
const {updateVariant, getAllVariants} = require("../controllers/Variant");

const router = express.Router();

/**
 * @swagger
 * /api/v1/variants/all:
 *   get:
 *     summary: Get all product variants
 *     tags: [Variants]
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: Filter by product ID
 *         example: 64abc123def456789
 *       - in: query
 *         name: color
 *         schema:
 *           type: string
 *         description: Filter by color
 *         example: Red
 *       - in: query
 *         name: age
 *         schema:
 *           type: string
 *         description: Filter by age
 *         example: M
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *         example: 100
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *         example: 1000
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: boolean
 *         description: Filter by stock availability
 *         example: true
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [price-low-to-high, price-high-to-low, highest-rated, most-popular]
 *         description: Sort variants by different criteria
 *         example: price-low-to-high
 *     responses:
 *       200:
 *         description: Variants retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalVariants:
 *                   type: number
 *                   example: 25
 *                 variants:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Variant'
 *       500:
 *         description: Server error
 */
// Get all variants
router.get("/all", getAllVariants);

/**
 * @swagger
 * /api/v1/variants/update:
 *   put:
 *     summary: Update a product variant
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - variantId
 *             properties:
 *               variantId:
 *                 type: string
 *                 description: Variant ID to update
 *                 example: 64abc123def456790
 *               age:
 *                 type: string
 *                 example: L
 *               color:
 *                 type: string
 *                 example: Blue
 *               price:
 *                 type: number
 *                 example: 1299
 *               stock:
 *                 type: number
 *                 example: 100
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Variant images (optional)
 *     responses:
 *       200:
 *         description: Variant updated successfully
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
 *                   example: Variant updated successfully
 *                 variant:
 *                   $ref: '#/components/schemas/Variant'
 *       404:
 *         description: Variant not found
 *       401:
 *         description: Unauthorized
 */
// Update a variant
router.put(
  "/update",
  verifyToken,
  (req, res, next) => parser.any()(req, res, next),
  updateVariant
);

module.exports = router;