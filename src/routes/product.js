const express = require("express");
const { parser } = require("../config/cloudinary");
const { 
  createProduct, 
  updateProduct, 
  getAllProducts, 
  getProductById, 
  getVariantById 
} = require("../controllers/product");
const verifyToken = require("../middlewares/authMiddleware");
const router = express.Router();

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
router.post("/create",verifyToken,(req, res, next) => {
    parser.any()(req, res, function (err) {
      if (err) {
        console.error("❌ Multer/Cloudinary Error:", err);
        return res.status(400).json({ message: "Upload error", error: err });
      }
      console.log("✅ Multer parsing done");
      next();
    });
  } , createProduct );

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
router.get("/all", getAllProducts);

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
router.get("/:productId", getProductById);

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

module.exports = router;
