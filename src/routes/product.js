const express = require("express");
const { parser } = require("../config/cloudinary");
const { createProduct,updateProduct } = require("../controllers/product");
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
 *                 example: '[{"size":"M","color":"Red","price":999,"stock":50}]'
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
module.exports = router;
