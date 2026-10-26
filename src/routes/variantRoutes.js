const express = require("express");
const verifyToken = require("../middlewares/authMiddleware");

const router = express.Router();

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
 * @swagger
 * /api/v1/variants/{productId}/export:
 *   get:
 *     summary: Export product variants to CSV
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get("/:productId/export", verifyToken, exportVariants);

/**
 * @swagger
 * /api/v1/variants/{productId}/import:
 *   post:
 *     summary: Import product variants from CSV
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: CSV import results
 */
router.post(
  "/:productId/import",
  verifyToken,
  upload.single("file"),
  importVariants
);

/**
 * @swagger
 * /api/v1/variants/{productId}/bulk-stock:
 *   patch:
 *     summary: Bulk update variant stock
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantId:
 *                       type: string
 *                     stock:
 *                       type: number
 *     responses:
 *       200:
 *         description: Stock updated successfully
 */
router.patch("/:productId/bulk-stock", verifyToken, bulkUpdateStock);

/**
 * @swagger
 * /api/v1/variants/{productId}/bulk-price:
 *   patch:
 *     summary: Bulk update variant prices
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantId:
 *                       type: string
 *                     price:
 *                       type: number
 *                     discountPrice:
 *                       type: number
 *     responses:
 *       200:
 *         description: Prices updated successfully
 */
router.patch("/:productId/bulk-price", verifyToken, bulkUpdatePrice);

module.exports = router;
