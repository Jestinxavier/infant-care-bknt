// routes/csvImageRoutes.js
const express = require("express");
const router = express.Router();
const csvImageController = require("../controllers/csvImage.controller");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

/**
 * @swagger
 * tags:
 *   name: CSV Images
 *   description: Temporary image management for CSV import
 */

// Apply admin middleware to all routes
router.use(verifyToken);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/csv-images:
 *   get:
 *     summary: List all temp CSV images
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of temp images
 */
router.get("/", csvImageController.listTempImages);

/**
 * @swagger
 * /api/v1/admin/csv-images/upload:
 *   post:
 *     summary: Upload a temp CSV image
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 */
router.post("/upload", ...csvImageController.uploadTempImage);

/**
 * @swagger
 * /api/v1/admin/csv-images/validate:
 *   post:
 *     summary: Validate temp images exist
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               temp_keys:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post("/validate", csvImageController.validateTempImages);

/**
 * @swagger
 * /api/v1/admin/csv-images/convert:
 *   post:
 *     summary: Convert temp images to permanent
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               temp_keys:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Conversion result with mapping
 */
router.post("/convert", csvImageController.convertToPermanent);

/**
 * @swagger
 * /api/v1/admin/csv-images/cleanup:
 *   post:
 *     summary: Manual cleanup of old temp images
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxAgeHours:
 *                 type: integer
 *                 default: 24
 *     responses:
 *       200:
 *         description: Cleanup result
 */
router.post("/cleanup", csvImageController.manualCleanup);

/**
 * @swagger
 * /api/v1/admin/csv-images/{temp_key}:
 *   delete:
 *     summary: Delete a temp CSV image
 *     tags: [CSV Images]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: temp_key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Image deleted
 *       404:
 *         description: Image not found
 */
router.delete("/:temp_key", csvImageController.deleteTempImage);

module.exports = router;
