const express = require("express");
const {
  uploadAsset,
  getAssets,
  deleteAsset,
  promoteAsset,
} = require("../controllers/asset");
const verifyToken = require("../middlewares/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/admin/assets/upload:
 *   post:
 *     summary: Upload asset with hash-based deduplication
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - origin
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               origin:
 *                 type: object
 *                 properties:
 *                   source:
 *                     type: string
 *                     enum: [product, cms, category, banner]
 *                   sourceContext:
 *                     type: string
 *                     enum: [product-form, cms-editor, category-form, banner-upload]
 *               intendedFor:
 *                 type: string
 *                 enum: [product, cms, category, null]
 *     responses:
 *       201:
 *         description: Asset uploaded successfully
 *       200:
 *         description: Asset already exists (deduplicated)
 *       401:
 *         description: Unauthorized
 */
router.post("/upload", verifyToken, uploadAsset);

/**
 * @swagger
 * /api/admin/assets:
 *   get:
 *     summary: Get assets with filtering and pagination
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [temp, permanent]
 *       - in: query
 *         name: origin
 *         schema:
 *           type: string
 *           enum: [product, cms, category, banner]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Assets retrieved successfully
 */
router.get("/", verifyToken, getAssets);

/**
 * @swagger
 * /api/admin/assets/{id}:
 *   delete:
 *     summary: Delete asset (only if temp and unused)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset deleted successfully
 *       403:
 *         description: Cannot delete (permanent or in use)
 *       404:
 *         description: Asset not found
 */
router.delete("/:id", verifyToken, deleteAsset);

/**
 * @swagger
 * /api/admin/assets/promote:
 *   post:
 *     summary: Promote asset from temp to permanent
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicId
 *               - entity
 *               - entityId
 *             properties:
 *               publicId:
 *                 type: string
 *               entity:
 *                 type: string
 *                 enum: [product, cms, category]
 *               entityId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset promoted successfully
 *       404:
 *         description: Asset not found
 */
router.post("/promote", verifyToken, promoteAsset);

/**
 * @swagger
 * /api/admin/assets/{id}/promote:
 *   post:
 *     summary: Promote asset from temp to permanent (URL-based)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset publicId (URL-encoded)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [Product, Category, Banner]
 *               entityId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset promoted successfully
 *       404:
 *         description: Asset not found
 */
router.post("/:id/promote", verifyToken, (req, res) => {
  // Extract publicId from URL param and pass to existing handler
  req.body.publicId = decodeURIComponent(req.params.id);
  req.body.entity = req.body.entityType; // Map frontend field name to backend
  return promoteAsset(req, res);
});

module.exports = router;
