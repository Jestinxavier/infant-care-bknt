const express = require("express");
const router = express.Router();
const {
  getCmsContent,
  getCmsContentByPage,
  updateCmsContent,
  deleteCmsContent,
  updateCmsBlock,
} = require("../controllers/cms");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

/**
 * @swagger
 * tags:
 *   name: Admin CMS
 *   description: "[Admin] Content Management System endpoints"
 */

/**
 * @swagger
 * /api/v1/admin/cms:
 *   get:
 *     summary: "[Admin] Get all CMS content"
 *     description: Retrieve all CMS content for all pages (home, about, policies, header, footer). Requires admin authentication.
 *     tags: [Admin CMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CMS content fetched successfully
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
 *                   example: CMS content fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       page:
 *                         type: string
 *                         enum: [home, about, policies, header, footer]
 *                       title:
 *                         type: string
 *                       content:
 *                         type: object
 *       500:
 *         description: Internal Server Error
 *   post:
 *     summary: "[Admin] Create or update CMS content"
 *     description: Create or update CMS content for a specific page. Requires admin authentication.
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
 *               - title
 *               - content
 *             properties:
 *               page:
 *                 type: string
 *                 enum: [home, about, policies, header, footer]
 *                 example: home
 *               title:
 *                 type: string
 *                 example: Home Page
 *               content:
 *                 type: object
 *                 description: CMS content (can be array of blocks, string, or header/footer object)
 *     responses:
 *       200:
 *         description: CMS content created/updated successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal Server Error
 */

/**
 * @swagger
 * /api/v1/admin/cms/{page}:
 *   get:
 *     summary: "[Admin] Get CMS content by page"
 *     description: Retrieve CMS content for a specific page. Requires admin authentication.
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
 *         description: Page identifier
 *     responses:
 *       200:
 *         description: CMS content fetched successfully
 *       404:
 *         description: CMS content not found
 *       500:
 *         description: Internal Server Error
 *   delete:
 *     summary: "[Admin] Delete CMS content for a page"
 *     description: Delete CMS content for a specific page. Requires admin authentication.
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
 *         description: Page identifier
 *     responses:
 *       200:
 *         description: CMS content deleted successfully
 *       404:
 *         description: CMS content not found
 *       500:
 *         description: Internal Server Error
 */

// Apply admin middleware to all CMS routes
router.use(verifyToken);
router.use(requireAdmin);

// GET /api/v1/admin/cms - Get all CMS content
router.get("/", getCmsContent);

// GET /api/v1/admin/cms/:page - Get CMS content by page
router.get("/:page", getCmsContentByPage);

// POST /api/v1/admin/cms - Create or update CMS content
router.post("/", updateCmsContent);

// PUT /api/v1/admin/cms/:page - Update CMS content by page (alternative endpoint)
router.put("/:page", updateCmsContent);

// PATCH /api/v1/admin/cms/:page/block/:blockType - Update specific block
// Note: blockType is in the URL to match frontend hook, but logic uses body ID
router.patch("/:page/block/:blockType", updateCmsBlock);

// DELETE /api/v1/admin/cms/:page - Delete CMS content
router.delete("/:page", deleteCmsContent);

module.exports = router;
