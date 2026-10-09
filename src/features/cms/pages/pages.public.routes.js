/**
 * Public API routes for the Static Pages CMS (no auth).
 * Mounted at /api/v1/cms BEFORE the generic /:page route so
 * /cms/pages/:slug is never captured by it.
 */

const express = require("express");
const router = express.Router();
const pagesPublicController = require("./pages.public.controller");

/**
 * @swagger
 * /api/v1/cms/pages/{slug}:
 *   get:
 *     summary: "[Public] Get published static page content by slug"
 *     tags: [CMS]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         description: Published page slug (e.g. about-us, delivery-info)
 */
router.get("/pages/:slug", pagesPublicController.getPublishedPage);

module.exports = router;