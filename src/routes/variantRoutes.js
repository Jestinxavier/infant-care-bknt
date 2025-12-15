const express = require("express");
const { parser } = require("../config/cloudinary");
const verifyToken = require("../middlewares/authMiddleware");
const {
  updateVariant,
  getAllVariants,
  getVariantsByCategory,
} = require("../controllers/Variant");

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
 * /api/v1/variants/{slug}:
 *   get:
 *     summary: Get variants filtered by category slug
 *     tags: [Variants]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Category slug (use 'all' for all categories)
 *         example: rompers
 *       - in: query
 *         name: price
 *         schema:
 *           type: string
 *         description: Price range as comma-separated min,max (e.g., "554,999")
 *         example: "554,999"
 *       - in: query
 *         name: color
 *         schema:
 *           type: string
 *         description: Filter by color(s) as comma-separated values (e.g., "blue,green")
 *         example: "blue,green"
 *       - in: query
 *         name: age
 *         schema:
 *           type: string
 *         description: Filter by size/age as comma-separated values (e.g., "0-3,newborn")
 *         example: "0-3,newborn"
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by stock availability
 *         example: "true"
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, price_low, price_high, rating, popularity]
 *         description: Sort order (also accepts 'sortBy' for backward compatibility)
 *         example: price_low
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price (legacy format, use 'price' for new format)
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price (legacy format, use 'price' for new format)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, price_low, price_high, rating, popularity]
 *         description: Sort order (legacy format, use 'sort' for new format)
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
 *                 categoryTitle:
 *                   type: string
 *                   description: Category title (e.g., "Rompers", "All Products")
 *                   example: "Rompers"
 *                 items:
 *                   type: array
 *                   description: Array of variant items (each variant listed separately). Filtered by price range using effective price (discountPrice if available, otherwise regular price).
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       url_key:
 *                         type: string
 *                         description: Unique URL key for variant
 *                       title:
 *                         type: string
 *                       price:
 *                         type: number
 *                         description: Regular price
 *                       discountPrice:
 *                         type: number
 *                         nullable: true
 *                         description: Discount price (if available)
 *                       stock:
 *                         type: number
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                       attributes:
 *                         type: object
 *                         description: Variant attributes (color, size, etc.)
 *                       averageRating:
 *                         type: number
 *                       totalReviews:
 *                         type: number
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       description: Total number of items matching filters (after price filtering)
 *                       example: 100
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *       404:
 *         description: Category not found
 *       500:
 *         description: Server error
 */
// Get variants by category slug
router.get("/:slug", getVariantsByCategory);

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

// \u2705 NEW: CSV Import/Export Routes
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const {
  exportVariants,
  importVariants,
  bulkUpdateStock,
  bulkUpdatePrice,
} = require("../controllers/csvVariantController");

/**
 * Export product variants to CSV
 * GET /api/v1/variants/:productId/export
 */
router.get("/:productId/export", verifyToken, exportVariants);

/**
 * Import product variants from CSV
 * POST /api/v1/variants/:productId/import
 */
router.post(
  "/:productId/import",
  verifyToken,
  upload.single("file"),
  importVariants
);

/**
 * Bulk update variant stock
 * PATCH /api/v1/variants/:productId/bulk-stock
 */
router.patch("/:productId/bulk-stock", verifyToken, bulkUpdateStock);

/**
 * Bulk update variant prices
 * PATCH /api/v1/variants/:productId/bulk-price
 */
router.patch("/:productId/bulk-price", verifyToken, bulkUpdatePrice);

module.exports = router;
