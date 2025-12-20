const express = require("express");
const router = express.Router();
const cmsProductController = require("./product.cms.controller");

/**
 * @swagger
 * tags:
 *   name: CMS Products
 *   description: Lightweight product endpoints for CMS widgets
 */

/**
 * @swagger
 * /api/v1/cms/products:
 *   get:
 *     summary: Get products for CMS widgets (minimal fields)
 *     tags: [CMS Products]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Category ID filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of products to return
 *     responses:
 *       200:
 *         description: Products fetched successfully
 */
router.get("/", cmsProductController.getProductsForCms);

module.exports = router;
