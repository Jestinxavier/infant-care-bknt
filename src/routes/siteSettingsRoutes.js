const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  getAllSettings,
  getSetting,
  createSetting,
  updateSetting,
  deleteSetting,
  getPublicSettings,
} = require("../controllers/siteSettingsController");

/**
 * @swagger
 * /api/v1/settings/public:
 *   get:
 *     summary: Get public settings (no auth required)
 *     tags: [Settings]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *         description: Filter by scope (cart, contact, etc.)
 *     responses:
 *       200:
 *         description: Public settings retrieved
 */
router.get("/public", getPublicSettings);

/**
 * @swagger
 * /api/v1/admin/settings:
 *   get:
 *     summary: Get all settings (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 */
router.get("/", verifyToken, requireAdmin, getAllSettings);

/**
 * @swagger
 * /api/v1/admin/settings/{key}:
 *   get:
 *     summary: Get setting by key (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Setting retrieved
 *       404:
 *         description: Setting not found
 */
router.get("/:key", verifyToken, requireAdmin, getSetting);

/**
 * @swagger
 * /api/v1/admin/settings:
 *   post:
 *     summary: Create new setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *               - type
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                   - type: object
 *               type:
 *                 type: string
 *                 enum: [string, number, boolean, json]
 *               scope:
 *                 type: string
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Setting created
 */
router.post("/", verifyToken, requireAdmin, createSetting);

/**
 * @swagger
 * /api/v1/admin/settings/{key}:
 *   put:
 *     summary: Update setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                   - type: object
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Setting updated
 */
router.put("/:key", verifyToken, requireAdmin, updateSetting);

/**
 * @swagger
 * /api/v1/admin/settings/{key}:
 *   delete:
 *     summary: Delete setting (admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Setting deleted
 */
router.delete("/:key", verifyToken, requireAdmin, deleteSetting);

module.exports = router;
