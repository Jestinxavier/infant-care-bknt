const express = require("express");
const { parser } = require("../config/cloudinary");
const {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex,
} = require("../controllers/product");
const verifyToken = require("../middlewares/authMiddleware");
const router = express.Router();

// Search index route (must be before other routes)
router.get("/search-index", getSearchIndex);

/**
 * @swagger
 * /api/v1/product/create:
 *   post:
 *     summary: Create a new product with variants
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - category
 *               - brand
 *               - variants
 *             properties:
 *               name:
 *                 type: string
 *                 example: Premium T-Shirt
 *               description:
 *                 type: string
 *                 example: High quality cotton t-shirt
 *               category:
 *                 type: string
 *                 example: Clothing
 *               brand:
 *                 type: string
 *                 example: Nike
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Product images (multiple files)
 *               variants:
 *                 type: string
 *                 description: JSON string array of variants
 *                 example: '[{"age":"M","color":"Red","price":999,"stock":50}]'
 *     responses:
 *       201:
 *         description: Product created successfully
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
 *                   example: Product created successfully
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *                 variants:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Variant'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
// Use `parser.array` to accept multiple images (field name must match Postman/frontend)
router.post(
  "/create",
  verifyToken,
  (req, res, next) => {
    parser.any()(req, res, function (err) {
      if (err) {
        console.error("❌ Multer/Cloudinary Error:", err);
        return res.status(400).json({ message: "Upload error", error: err });
      }
      console.log("✅ Multer parsing done");
      next();
    });
  },
  createProduct
);

/**
 * @swagger
 * /api/v1/product/update:
 *   put:
 *     summary: Update an existing product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: string
 *                 example: 64abc123def456789
 *               name:
 *                 type: string
 *                 example: Updated Product Name
 *               description:
 *                 type: string
 *                 example: Updated description
 *               category:
 *                 type: string
 *                 example: Electronics
 *               brand:
 *                 type: string
 *                 example: Samsung
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: New product images (optional)
 *     responses:
 *       200:
 *         description: Product updated successfully
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
 *                   example: Product updated successfully
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 */
// Update product
router.put(
  "/update",
  verifyToken,
  (req, res, next) => parser.any()(req, res, next),
  updateProduct
);

/**
 * @swagger
 * /api/v1/product/all:
 *   get:
 *     summary: Get all products with ratings
 *     description: Retrieve all products with rating information. Supports filtering and sorting.
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *         example: Clothing
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *         description: Minimum average rating filter
 *         example: 4
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [rating, reviews, newest]
 *         description: Sort products by rating, number of reviews, or newest
 *         example: rating
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalProducts:
 *                   type: number
 *                   example: 25
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       category:
 *                         type: string
 *                       averageRating:
 *                         type: number
 *                         example: 4.5
 *                       totalReviews:
 *                         type: number
 *                         example: 42
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/v1/product/all:
 *   get:
 *     summary: Get all products (returns variants as separate items if inStock, otherwise parent)
 *     description: Returns all products. If a product has inStock variants, returns those variants as separate items. Otherwise returns the parent product. Supports pagination and filtering.
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category slug (use 'all' for all categories)
 *         example: jumpsuits
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, price_low, price_high, rating, popularity]
 *         description: Sort order (also accepts 'sortBy' for backward compatibility)
 *         example: price_low
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
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price (legacy format, use 'price' for new format)
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price (legacy format, use 'price' for new format)
 *     responses:
 *       200:
 *         description: Products retrieved successfully
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
 *                   description: Array of products or variants (variants listed separately if inStock). Filtered by price range using effective price (discountPrice if available, otherwise regular price).
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       url_key:
 *                         type: string
 *                         description: Unique URL key for product/variant
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
 */

router.get("/all", getAllProducts);
// POST endpoint for fetching products (for dashboard)
router.post("/all", getAllProducts);

/**
 * @swagger
 * /api/v1/product/{productId}:
 *   get:
 *     summary: Get single product by ID with variants
 *     description: Get detailed product information including all variants and ratings
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *         example: 64abc123def456788
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 product:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     category:
 *                       type: string
 *                     averageRating:
 *                       type: number
 *                       example: 4.3
 *                     totalReviews:
 *                       type: number
 *                       example: 156
 *                 variants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       age:
 *                         type: string
 *                       color:
 *                         type: string
 *                       price:
 *                         type: number
 *                       stock:
 *                         type: number
 *                       averageRating:
 *                         type: number
 *                       totalReviews:
 *                         type: number
 *                 totalVariants:
 *                   type: number
 *                   example: 5
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */
// New endpoint: Get product by url_key (primary method)
/**
 * @swagger
 * /api/v1/product/url/{url_key}:
 *   get:
 *     summary: Get single product by url_key with variants
 *     description: Get detailed product information by url_key including all variants and ratings. Supports backward compatibility with _id.
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: url_key
 *         required: true
 *         schema:
 *           type: string
 *         description: Product url_key (e.g., "infant-organic-cotton-jumpsuit")
 *         example: infant-organic-cotton-jumpsuit
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *       404:
 *         description: Product not found
 *       500:
 *         description: Server error
 */
router.get("/url/:url_key", getProductByUrlKey);
router.post("/url/:url_key", getProductByUrlKey);

// Combined route for ID (legacy) or Category Slug (new)
router.get("/:param", (req, res, next) => {
  const { param } = req.params;

  // Check if param is a valid ObjectId (12 bytes or 24 hex chars)
  // Mongoose IDs are 24 hex characters
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);

  if (isObjectId) {
    // If it looks like an ID, treat it as productId
    // We can manually call getProductById or rewrite params and call next() if we had separate handlers
    // But since getProductById expects req.params.productId, let's just forward to it
    req.params.productId = param;
    return getProductById(req, res, next);
  } else {
    // If it's NOT an ID, assume it's a category slug
    // Inject it into query.category so getAllProducts sees it
    req.query.category = param;
    return getAllProducts(req, res, next);
  }
});
// POST endpoint for fetching product by ID (for dashboard) - keep strict ID check or use similar logic if needed
router.post("/:productId", getProductById);

/**
 * @swagger
 * /api/v1/product/variant/{variantId}:
 *   get:
 *     summary: Get variant by ID with rating
 *     description: Get specific variant details with product info and ratings
 *     tags: [Products]
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
 *         description: Variant retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 variant:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     productId:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         category:
 *                           type: string
 *                         averageRating:
 *                           type: number
 *                         totalReviews:
 *                           type: number
 *                     age:
 *                       type: string
 *                     color:
 *                       type: string
 *                     price:
 *                       type: number
 *                     stock:
 *                       type: number
 *                     averageRating:
 *                       type: number
 *                       example: 4.7
 *                     totalReviews:
 *                       type: number
 *                       example: 23
 *       404:
 *         description: Variant not found
 *       500:
 *         description: Server error
 */
router.get("/variant/:variantId", getVariantById);

/**
 * @swagger
 * /api/v1/product/bulk-delete:
 *   post:
 *     summary: Bulk delete multiple products
 *     description: Delete multiple products and all associated data (variants, reviews, images) in a single request
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productIds
 *             properties:
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["64abc123def456789", "64abc123def456790"]
 *                 description: Array of product IDs to delete
 *     responses:
 *       200:
 *         description: Products deleted successfully (all or partial)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 partialSuccess:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Successfully deleted 5 product(s)
 *                 results:
 *                   type: object
 *                   properties:
 *                     totalRequested:
 *                       type: number
 *                       example: 5
 *                     successCount:
 *                       type: number
 *                       example: 5
 *                     failureCount:
 *                       type: number
 *                       example: 0
 *                     deletedVariantsCount:
 *                       type: number
 *                       example: 25
 *                     deletedReviewsCount:
 *                       type: number
 *                       example: 42
 *                     deletedImagesCount:
 *                       type: number
 *                       example: 30
 *                     successful:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           deletedVariants:
 *                             type: number
 *                           deletedReviews:
 *                             type: number
 *                           deletedImages:
 *                             type: number
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: string
 *                           reason:
 *                             type: string
 *       400:
 *         description: Invalid request or all products failed to delete
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Server error
 */
router.post("/bulk-delete", verifyToken, bulkDeleteProducts);

/**
 * @swagger
 * /api/v1/product/{productId}:
 *   delete:
 *     summary: Delete a product and all its variants
 *     description: Permanently delete a product and all associated variants. This action cannot be undone.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to delete
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Product deleted successfully
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
 *                   example: Product and all associated data deleted successfully
 *                 deletedProduct:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 deletedVariantsCount:
 *                   type: number
 *                   example: 5
 *                 deletedReviewsCount:
 *                   type: number
 *                   example: 12
 *                   description: Number of reviews deleted along with variants
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Product not found
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Server error
 */
router.delete("/:productId", verifyToken, deleteProduct);

module.exports = router;
