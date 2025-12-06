const express = require("express");
const router = express.Router();
const productController = require("./product.controller");
const productValidation = require("./product.validation");
const { validate } = require("../../core/middleware/validator");

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management endpoints (Storefront)
 */

/**
 * @swagger
 * /api/v1/product:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
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
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products fetched successfully
 */
router.get(
  "/",
  validate(productValidation.list),
  productController.getAllProducts
);

/**
 * @swagger
 * /api/v1/product/search:
 *   get:
 *     summary: Search products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products found
 */
router.get("/search", productController.searchProducts);

/**
 * @swagger
 * /api/v1/product/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product fetched successfully
 */
router.get(
  "/:id",
  validate(productValidation.getById),
  productController.getProductById
);

/**
 * @swagger
 * /api/v1/product/url/{urlKey}:
 *   get:
 *     summary: Get product by URL key
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: urlKey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product fetched successfully
 */
router.get("/url/:urlKey", productController.getProductByUrlKey);

module.exports = router;
