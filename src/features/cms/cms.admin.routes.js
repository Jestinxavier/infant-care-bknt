const express = require("express");
const router = express.Router();
const cmsAdminController = require("./cms.admin.controller");
const verifyToken = require("../../middlewares/authMiddleware");
const requireAdmin = require("../../middlewares/adminMiddleware");
const { validate } = require("../../core/middleware/validator");
const cmsValidation = require("./cms.validation");

/**
 * @swagger
 * tags:
 *   name: Admin CMS
 *   description: "[Admin] Content Management System endpoints"
 */

// Apply admin middleware
router.use(verifyToken);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/cms:
 *   get:
 *     summary: "[Admin] Get all CMS content"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", cmsAdminController.getAllContent);

/**
 * @swagger
 * /api/v1/admin/cms:
 *   post:
 *     summary: "[Admin] Update CMS content"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - page
 *               - content
 *             properties:
 *               page:
 *                 type: string
 *                 enum: [home, about, policies, header, footer]
 *               title:
 *                 type: string
 *               content:
 *                 type: array
 *                 description: Array of blocks for home/about pages, or single object for others
 */
router.post(
  "/",
  validate(cmsValidation.validateUpdateContent),
  cmsAdminController.updateContent
);

// ============================================
// IMPORTANT: More specific routes MUST come before wildcard `:page` routes
// ============================================

/**
 * @swagger
 * /api/v1/admin/cms/{page}/block/{blockType}:
 *   patch:
 *     summary: "[Admin] Update a single block within a page"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: page
 *         required: true
 *         schema:
 *           type: string
 *           enum: [home, about]
 *       - in: path
 *         name: blockType
 *         required: true
 *         schema:
 *           type: string
 *         description: The block_type identifier (e.g., heroBanner, categoryBanner)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The block data to update (partial updates supported)
 */
router.patch("/:page/block/:blockType", cmsAdminController.updateSingleBlock);

// ============================================
// Wildcard `:page` routes come AFTER specific routes
// ============================================

/**
 * @swagger
 * /api/v1/admin/cms/{page}:
 *   get:
 *     summary: "[Admin] Get CMS content by page"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 */
router.get("/:page", cmsAdminController.getContentByPage);

/**
 * @swagger
 * /api/v1/admin/cms/{page}:
 *   put:
 *     summary: "[Admin] Update CMS content for specific page"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: page
 *         required: true
 *         schema:
 *           type: string
 *           enum: [home, about, policies, header, footer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: array
 *                 description: Array of blocks for home/about pages, or single object for others
 */
router.put(
  "/:page",
  validate(cmsValidation.validateUpdateContentByPage),
  cmsAdminController.updateContentByPage
);

/**
 * @swagger
 * /api/v1/admin/cms/{page}:
 *   delete:
 *     summary: "[Admin] Delete CMS content"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/:page", cmsAdminController.deleteContent);

module.exports = router;
