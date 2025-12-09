const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/media.controller");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

/**
 * @swagger
 * tags:
 *   name: Admin Media
 *   description: "[Admin] Media upload and management endpoints"
 */

// Apply admin middleware to all routes
router.use(verifyToken);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/media/upload:
 *   post:
 *     summary: "[Admin] Upload a media file to Cloudinary"
 *     description: Upload a single image file to Cloudinary. Returns Cloudinary metadata including URL, public_id, dimensions, and format.
 *     tags: [Admin Media]
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
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload (jpg, jpeg, png, webp)
 *     responses:
 *       200:
 *         description: File uploaded successfully
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
 *                   example: File uploaded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       example: https://res.cloudinary.com/...
 *                     public_id:
 *                       type: string
 *                       example: products/abc123
 *                     width:
 *                       type: integer
 *                       example: 800
 *                     height:
 *                       type: integer
 *                       example: 600
 *                     format:
 *                       type: string
 *                       example: jpg
 *                     resource_type:
 *                       type: string
 *                       example: image
 *                     bytes:
 *                       type: integer
 *                     created_at:
 *                       type: string
 *                     alt:
 *                       type: string
 *       400:
 *         description: No file provided or upload failed
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
// uploadMedia is an array of middleware, so we need to spread it
router.post("/upload", ...mediaController.uploadMedia);

/**
 * @swagger
 * /api/v1/admin/media/delete/{publicId}:
 *   delete:
 *     summary: "[Admin] Delete a media file from Cloudinary"
 *     description: Delete a file from Cloudinary using its public_id. Operation is idempotent (safe to call multiple times).
 *     tags: [Admin Media]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cloudinary public_id of the file to delete
 *         example: products/abc123
 *     responses:
 *       200:
 *         description: File deleted successfully
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
 *                   example: File deleted successfully
 *       400:
 *         description: Public ID is required
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.delete("/delete", mediaController.deleteMedia);

/**
 * @swagger
 * /api/v1/admin/media/finalize:
 *   post:
 *     summary: "[Admin] Mark images as final (remove temp tag)"
 *     description: Remove temp-upload tag from Cloudinary and mark images as final in database. Called when form is submitted.
 *     tags: [Admin Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicIds
 *             properties:
 *               publicIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Cloudinary public_ids to finalize
 *                 example: ["cms/abc123", "cms/def456"]
 *     responses:
 *       200:
 *         description: Images finalized successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/finalize", mediaController.finalizeMedia);

/**
 * @swagger
 * /api/v1/admin/media/delete-temp:
 *   post:
 *     summary: "[Admin] Batch delete temp images"
 *     description: Delete multiple temporary images from Cloudinary and database. Used for cancel/cleanup operations.
 *     tags: [Admin Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicIds
 *             properties:
 *               publicIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Cloudinary public_ids to delete
 *                 example: ["cms/abc123", "cms/def456"]
 *     responses:
 *       200:
 *         description: Temp images deleted successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/delete-temp", mediaController.deleteTempMedia);

module.exports = router;
