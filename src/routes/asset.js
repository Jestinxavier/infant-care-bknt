const express = require("express");
const {
  uploadAsset,
  getAssets,
  deleteAsset,
  promoteAsset,
  bulkDeleteAssets,
} = require("../controllers/asset");
const verifyToken = require("../middlewares/authMiddleware");
const { executeCleanup } = require("../jobs/cleanupExpiredAssets");

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
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
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
 * /api/admin/assets/bulk-delete:
 *   post:
 *     summary: Bulk delete assets
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               force:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Assets deleted successfully
 */
router.post("/bulk-delete", verifyToken, bulkDeleteAssets);

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
  // Map frontend field name to backend and normalize to lowercase
  // Schema expects lowercase: ["product", "cms", "category"]
  req.body.entity = req.body.entityType?.toLowerCase();
  return promoteAsset(req, res);
});

/**
 * @swagger
 * /api/admin/assets/cleanup:
 *   post:
 *     summary: Manually trigger cleanup of expired temp and archived assets
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 description: If true, only report what would be deleted without actually deleting
 *     responses:
 *       200:
 *         description: Cleanup completed or dry-run results
 *       500:
 *         description: Cleanup failed
 */
router.post("/cleanup", verifyToken, async (req, res) => {
  try {
    const { dryRun = false } = req.body;

    console.log(
      `🧹 [Manual Cleanup] Triggered by ${
        req.user?.email || "unknown"
      } (dryRun: ${dryRun})`,
    );

    const results = await executeCleanup({ dryRun });

    res.status(200).json({
      success: true,
      message: dryRun
        ? `Dry run complete. Would delete ${
            results.tempAssetsFound + results.archivedAssetsFound
          } assets.`
        : `Cleanup complete. Deleted ${results.deletedCount} assets.`,
      results,
    });
  } catch (error) {
    console.error("❌ Manual cleanup error:", error);
    res.status(500).json({
      success: false,
      message: "Cleanup failed",
      error: error.message,
    });
  }
});

module.exports = router;
