const express = require("express");
const router = express.Router();
const cmsAdminController = require("./cms.admin.controller");
const verifyToken = require("../../middlewares/authMiddleware");
const requireAdmin = require("../../middlewares/adminMiddleware");

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
 * /api/v1/admin/cms:
 *   post:
 *     summary: "[Admin] Update CMS content"
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 */
router.post("/", cmsAdminController.updateContent);

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

