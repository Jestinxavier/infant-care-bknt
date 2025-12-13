const express = require("express");
const router = express.Router();
const productAdminController = require("./product.admin.controller");
const productValidation = require("./product.validation");
const { validate } = require("../../core/middleware/validator");
const verifyToken = require("../../middlewares/authMiddleware");
const requireAdmin = require("../../middlewares/adminMiddleware");

const { parser } = require("../../config/cloudinary");
const parseMultipartBody = require("../../middlewares/parseMultipartBody");
const bulkDeleteProducts = require("../../controllers/product/bulkDeleteProducts");

/**
 * @swagger
 * tags:
 *   name: Admin Products
 *   description: "[Admin] Product management endpoints"
 */

// Apply admin middleware to all routes
router.use(verifyToken);
router.use(requireAdmin);

/**
 * @swagger
 * /api/v1/admin/products:
 *   get:
 *     summary: "[Admin] Get all products"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/",
  validate(productValidation.list),
  productAdminController.getAllProducts,
);

/**
 * @swagger
 * /api/v1/admin/products:
 *   post:
 *     summary: "[Admin] Create product"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/",
  parser.any(),
  parseMultipartBody,
  validate(productValidation.create),
  productAdminController.createProduct,
);

/**
 * @swagger
 * /api/v1/admin/products/bulk-delete:
 *   post:
 *     summary: "[Admin] Bulk delete products"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.post("/bulk-delete", bulkDeleteProducts);

/**
 * @swagger
 * /api/v1/admin/products/{id}:
 *   get:
 *     summary: "[Admin] Get product by ID"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/:id",
  validate(productValidation.getById),
  productAdminController.getProductById,
);

/**
 * @swagger
 * /api/v1/admin/products/{id}:
 *   put:
 *     summary: "[Admin] Update product"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/:id",
  parser.any(),
  parseMultipartBody,
  validate([...productValidation.getById, ...productValidation.update]),
  productAdminController.updateProduct,
);

/**
 * @swagger
 * /api/v1/admin/products/{id}:
 *   delete:
 *     summary: "[Admin] Delete product"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  "/:id",
  validate(productValidation.delete),
  productAdminController.deleteProduct,
);

/**
 * @swagger
 * /api/v1/admin/products/{id}/status:
 *   patch:
 *     summary: "[Admin] Update product status"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  "/:id/status",
  validate(productValidation.getById),
  productAdminController.updateProductStatus,
);

/**
 * @swagger
 * /api/v1/admin/products/bulk/status:
 *   patch:
 *     summary: "[Admin] Bulk update product status"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.patch("/bulk/status", productAdminController.bulkUpdateStatus);

/**
 * @swagger
 * /api/v1/admin/products/check-sku/{sku}:
 *   get:
 *     summary: "[Admin] Check SKU availability"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.get("/check-sku/:sku", productAdminController.checkSkuAvailability);

/**
 * @swagger
 * /api/v1/admin/products/check-url-key/{urlKey}:
 *   get:
 *     summary: "[Admin] Check URL key availability"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/check-url-key/:urlKey",
  productAdminController.checkUrlKeyAvailability,
);

/**
 * @swagger
 * /api/v1/admin/products/generate-sku:
 *   post:
 *     summary: "[Admin] Generate SKU suggestion"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.post("/generate-sku", productAdminController.generateSkuSuggestion);

/**
 * @swagger
 * /api/v1/admin/products/{id}/lock-sku:
 *   patch:
 *     summary: "[Admin] Lock product SKU"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  "/:id/lock-sku",
  validate(productValidation.getById),
  productAdminController.lockProductSku,
);

/**
 * @swagger
 * /api/v1/admin/products/{id}/variants/{variantId}/lock-sku:
 *   patch:
 *     summary: "[Admin] Lock variant SKU"
 *     tags: [Admin Products]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  "/:id/variants/:variantId/lock-sku",
  validate(productValidation.getById),
  productAdminController.lockVariantSku,
);

module.exports = router;
