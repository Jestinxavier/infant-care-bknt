const express = require("express");
const router = express.Router();
const cmsController = require("./cms.controller");

/**
 * @swagger
 * tags:
 *   name: CMS
 *   description: "[Public] Content Management System endpoints"
 */

/**
 * @swagger
 * /api/v1/cms/{page}:
 *   get:
 *     summary: "[Public] Get CMS content by page"
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: page
 *         required: true
 *         schema:
 *           type: string
 *           enum: [home, about, policies, header, footer]
 *         description: The page identifier
 *       - in: query
 *         name: slug
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional slug for filtering policies (privacy, terms, shipping, returns)
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
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: string
 *                     title:
 *                       type: string
 *                     content:
 *                       type: string
 *                       description: HTML content for policies page, or array/object for other pages
 */
router.get("/:page", cmsController.getContentByPage);

module.exports = router;

