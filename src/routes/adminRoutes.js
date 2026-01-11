const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  getAllProducts,
  getProductById,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getAllCategories,
  getCategoryById,
  getAllCustomers,
  getAllReviews,
  replyToReview,
} = require("../controllers/admin");

const {
  getDashboardStats,
} = require("../controllers/admin/dashboardController");

// Import existing product controllers for create/update/delete
const {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
} = require("../controllers/product");
const { parser } = require("../config/cloudinary");
const parseMultipartBody = require("../middlewares/parseMultipartBody");

// Import existing category controllers for create/update/delete
const {
  createCategory,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories,
} = require("../controllers/category");
const { categoryImageUploader } = require("../config/categoryImageUpload");

// Import coupon controller
const {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
} = require("../controllers/admin/couponController");

// ==================== PRODUCTS ====================

/**
 * @swagger
 * /api/v1/admin/products:
 *   get:
 *     summary: "[Admin] Get all products with full details"
 *     description: Retrieve all products with complete information including drafts, inactive products, and all variants. Supports pagination, filtering, and sorting.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category ID or slug
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by product status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in product title, name, or description
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, title, price, stock]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order (1 for ascending, -1 for descending)
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal Server Error
 *   post:
 *     summary: "[Admin] Get all products with full details (POST method)"
 *     description: Same as GET but accepts filters in request body. Useful for complex filtering.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: integer
 *               limit:
 *                 type: integer
 *               category:
 *                 type: string
 *               status:
 *                 type: string
 *               search:
 *                 type: string
 *               sortBy:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 */
router.get("/products", verifyToken, requireAdmin, getAllProducts);
router.post("/products", verifyToken, requireAdmin, getAllProducts);

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: "[Admin] Get dashboard statistics"
 *     description: Retrieve aggregated stats for dashboard (Revenue, Orders, Customers, Stock).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
 */
router.get("/dashboard", verifyToken, requireAdmin, getDashboardStats);

/**
 * @swagger
 * /api/v1/admin/products/bulk-delete:
 *   post:
 *     summary: "[Admin] Bulk delete products"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/products/bulk-delete",
  verifyToken,
  requireAdmin,
  bulkDeleteProducts
);

// Import Product model for lean search
const Product = require("../models/Product");

/**
 * @swagger
 * /api/v1/admin/products/search:
 *   get:
 *     summary: "[Admin] Search products for bundle child picker"
 *     description: Lightweight search returning only essential fields for bundle configuration
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (SKU or title)
 *       - in: query
 *         name: product_type
 *         schema:
 *           type: string
 *           enum: [SIMPLE, CONFIGURABLE, BUNDLE]
 *         description: Filter by product type (default SIMPLE for bundles)
 *     responses:
 *       200:
 *         description: Products found
 */
router.get("/products/search", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { q, product_type = "SIMPLE", limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "Search term must be at least 2 characters",
      });
    }

    const searchRegex = new RegExp(q.trim(), "i");

    // Find products with minimal fields
    const products = await Product.find({
      $or: [{ sku: searchRegex }, { title: searchRegex }],
      product_type: product_type,
      status: "published",
    })
      .select("_id title sku url_key stockObj product_type")
      .limit(parseInt(limit))
      .lean();

    // Transform response to minimal format
    const data = products.map((p) => ({
      _id: p._id,
      title: p.title,
      sku: p.sku,
      url_key: p.url_key,
      stock: p.stockObj?.available ?? 0,
      product_type: p.product_type,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Admin product search error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Search failed",
    });
  }
});

// Import bulk import controller
const bulkImportController = require("../controllers/product/bulkImport");

/**
 * @swagger
 * /api/v1/admin/products/validate-import:
 *   post:
 *     summary: "[Admin] Phase 1: Validate CSV import data"
 *     description: Validates all products without writing to database. Returns errors if any validation fails.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post(
  "/products/validate-import",
  verifyToken,
  requireAdmin,
  bulkImportController.validateImport
);

/**
 * @swagger
 * /api/v1/admin/products/commit-import:
 *   post:
 *     summary: "[Admin] Phase 2: Commit CSV import (atomic)"
 *     description: Commits all products atomically. Rolls back on any failure.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Import completed
 *       500:
 *         description: Import failed and rolled back
 */
router.post(
  "/products/commit-import",
  verifyToken,
  requireAdmin,
  bulkImportController.commitImport
);

/**
 * @swagger
 * /api/v1/admin/products/create:
 *   post:
 *     summary: "[Admin] Create a new product with variants"
 *     description: Create a new product with variants, images, and all product details. Supports multipart/form-data for image uploads.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - category
 *               - variants
 *             properties:
 *               name:
 *                 type: string
 *                 example: Premium T-Shirt
 *               title:
 *                 type: string
 *                 example: Premium T-Shirt
 *               description:
 *                 type: string
 *                 example: High quality cotton t-shirt
 *               category:
 *                 type: string
 *                 example: Clothing
 *               brand:
 *                 type: string
 *                 example: Nike
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 default: draft
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Product images (multiple files)
 *               variants:
 *                 type: string
 *                 description: JSON string array of variants
 *                 example: '[{"age":"M","color":"Red","price":999,"stock":50}]'
 *     responses:
 *       201:
 *         description: Product created successfully
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
 *                   example: Product created successfully
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
router.post(
  "/products/create",
  verifyToken,
  requireAdmin,
  (req, res, next) => {
    parser.any()(req, res, function (err) {
      if (err) {
        console.error("❌ Multer/Cloudinary Error:", err);
        return res.status(400).json({ message: "Upload error", error: err });
      }
      console.log("✅ Multer parsing done");
      next();
    });
  },
  createProduct
);

/**
 * @swagger
 * /api/v1/admin/products/{productId}:
 *   get:
 *     summary: "[Admin] Get single product by ID with full details"
 *     description: Retrieve complete product information including all variants, pricing, inventory, and metadata. Includes draft and inactive products.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: "[Admin] Get single product by ID (POST method)"
 *     description: Same as GET but accepts productId in request body.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 */
router.get("/products/:productId", verifyToken, requireAdmin, getProductById);
router.post("/products/:productId", verifyToken, requireAdmin, getProductById);

/**
 * @swagger
 * /api/v1/admin/products/{productId}:
 *   patch:
 *     summary: "[Admin] Update an existing product"
 *     description: Update product details, variants, images, and metadata. Supports partial updates.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to update
 *         example: 64abc123def456789
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID (also in path)
 *               title:
 *                 type: string
 *                 example: Updated Product Name
 *               name:
 *                 type: string
 *                 example: Updated Product Name
 *               description:
 *                 type: string
 *                 example: Updated description
 *               category:
 *                 type: string
 *                 example: Electronics
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: New product images (optional)
 *               variants:
 *                 type: string
 *                 description: JSON string array of updated variants
 *     responses:
 *       200:
 *         description: Product updated successfully
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
 *                   example: Product updated successfully
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/products/:productId",
  verifyToken,
  requireAdmin,
  (req, res, next) => parser.any()(req, res, next),
  parseMultipartBody,
  updateProduct
);

/**
 * @swagger
 * /api/v1/admin/products/{productId}:
 *   delete:
 *     summary: "[Admin] Delete a product and all its variants"
 *     description: Permanently delete a product and all associated variants. This action cannot be undone.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID to delete
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Product deleted successfully
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
 *                   example: Product and all associated variants deleted successfully
 *                 deletedProduct:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                 deletedVariantsCount:
 *                   type: number
 *                   example: 5
 *       404:
 *         description: Product not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/products/:productId", verifyToken, requireAdmin, deleteProduct);

// ==================== ORDERS ====================

/**
 * @swagger
 * /api/v1/admin/orders:
 *   get:
 *     summary: "[Admin] Get all orders (all users)"
 *     description: Retrieve all orders from all users with complete details. Supports pagination, filtering by status, and search.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, processing, shipped, delivered, cancelled]
 *         description: Filter by order status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [pending, paid, failed, refunded]
 *         description: Filter by payment status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order ID or user email
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: "[Admin] Get all orders (POST method)"
 *     description: Same as GET but accepts filters in request body.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page:
 *                 type: integer
 *               limit:
 *                 type: integer
 *               status:
 *                 type: string
 *               paymentStatus:
 *                 type: string
 *               search:
 *                 type: string
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 */
router.get("/orders", verifyToken, requireAdmin, getAllOrders);
router.post("/orders", verifyToken, requireAdmin, getAllOrders);

/**
 * @swagger
 * /api/v1/admin/orders/{orderId}:
 *   get:
 *     summary: "[Admin] Get single order by ID with full details"
 *     description: Retrieve complete order information including user details, items, address, and payment information.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: "[Admin] Get single order by ID (POST method)"
 *     description: Same as GET but accepts orderId in request body.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 */
router.get("/orders/:orderId", verifyToken, requireAdmin, getOrderById);
router.post("/orders/:orderId", verifyToken, requireAdmin, getOrderById);

/**
 * @swagger
 * /api/v1/admin/orders/{orderId}/status:
 *   patch:
 *     summary: "[Admin] Update order status"
 *     description: Update the status of an order (e.g., pending, confirmed, processing, shipped, delivered, cancelled).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *         example: 64abc123def456789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled]
 *                 example: shipped
 *                 description: New order status
 *     responses:
 *       200:
 *         description: Order status updated successfully
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
 *                   example: Order status updated successfully
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/orders/:orderId/status",
  verifyToken,
  requireAdmin,
  updateOrderStatus
);

// ==================== CUSTOMERS ====================

/**
 * @swagger
 * /api/v1/admin/customers:
 *   get:
 *     summary: "[Admin] Get all customers"
 *     description: Retrieve customers with pagination and order stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
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
 *         name: search
 *         schema:
 *           type: string
 *           description: Search by name, email, phone, or ID
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 */
router.get("/customers", verifyToken, requireAdmin, getAllCustomers);
router.post("/customers", verifyToken, requireAdmin, getAllCustomers);

// ==================== REVIEWS ====================

/**
 * @swagger
 * /api/v1/admin/reviews:
 *   get:
 *     summary: "[Admin] Get all product reviews"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get("/reviews", verifyToken, requireAdmin, getAllReviews);

/**
 * @swagger
 * /api/v1/admin/reviews/reply:
 *   post:
 *     summary: "[Admin] Reply to a review"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post("/reviews/reply", verifyToken, requireAdmin, replyToReview);

// ==================== COUPONS ====================

/**
 * @swagger
 * /api/v1/admin/coupons:
 *   get:
 *     summary: "[Admin] List all coupons"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: "[Admin] Create a new coupon"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get("/coupons", verifyToken, requireAdmin, listCoupons);
router.post("/coupons", verifyToken, requireAdmin, createCoupon);

/**
 * @swagger
 * /api/v1/admin/coupons/{id}:
 *   patch:
 *     summary: "[Admin] Update coupon"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: "[Admin] Delete coupon"
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.patch("/coupons/:id", verifyToken, requireAdmin, updateCoupon);
router.delete("/coupons/:id", verifyToken, requireAdmin, deleteCoupon);

// ==================== CACHE REVALIDATION ====================
// Secure proxy for Next.js cache revalidation - requires admin auth
const revalidateProxy = require("../../routes/admin/revalidate");
router.use("/", revalidateProxy);

// ==================== CATEGORIES ====================

/**
 * @swagger
 * /api/v1/admin/categories:
 *   get:
 *     summary: "[Admin] Get all categories including inactive"
 *     description: Retrieve all categories including inactive ones. Admin can see all categories regardless of active status.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include inactive categories (defaults to true for admin)
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 totalCategories:
 *                   type: integer
 *                   example: 25
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       slug:
 *                         type: string
 *                       description:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *                       displayOrder:
 *                         type: number
 *                       parentCategory:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: "[Admin] Get all categories (POST method)"
 *     description: Same as GET but accepts includeInactive in request body.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               includeInactive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get("/categories", verifyToken, requireAdmin, getAllCategories);
// router.post("/categories", verifyToken, requireAdmin, getAllCategories); // Removed: Duplicate route conflicts with createCategory

/**
 * @swagger
 * /api/v1/admin/categories/bulk-delete:
 *   post:
 *     summary: "[Admin] Bulk delete categories"
 *     description: Delete multiple categories at once. Categories with products or sub-categories will not be deleted.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryIds
 *             properties:
 *               categoryIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of category IDs to delete
 *     responses:
 *       200:
 *         description: Categories deleted (fully or partially)
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/categories/bulk-delete",
  verifyToken,
  requireAdmin,
  bulkDeleteCategories
);

/**
 * @swagger
 * /api/v1/admin/categories/{categoryId}:
 *   get:
 *     summary: "[Admin] Get single category by ID"
 *     description: Retrieve complete category information including parent category details.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 category:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     description:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     displayOrder:
 *                       type: number
 *                     parentCategory:
 *                       type: object
 *       404:
 *         description: Category not found
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: "[Admin] Get single category by ID (POST method)"
 *     description: Same as GET but accepts categoryId in request body.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryId
 *             properties:
 *               categoryId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 */
router.get(
  "/categories/:categoryId",
  verifyToken,
  requireAdmin,
  getCategoryById
);
router.post(
  "/categories/:categoryId",
  verifyToken,
  requireAdmin,
  getCategoryById
);

/**
 * @swagger
 * /api/v1/admin/categories:
 *   post:
 *     summary: "[Admin] Create a new category"
 *     description: Create a new product category with optional parent category, image, and display order.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Electronics
 *               description:
 *                 type: string
 *                 example: Electronic products and gadgets
 *               displayOrder:
 *                 type: integer
 *                 example: 1
 *               isActive:
 *                 type: boolean
 *                 default: true
 *               parentCategory:
 *                 type: string
 *                 description: Parent category ID (optional)
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Category image (optional)
 *     responses:
 *       201:
 *         description: Category created successfully
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
 *                   example: Category created successfully
 *                 category:
 *                   type: object
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/categories",
  verifyToken,
  requireAdmin,
  (req, res, next) => {
    categoryImageUploader.single("image")(req, res, function (err) {
      if (err) {
        console.error("❌ Category image upload error:", err);
        return res
          .status(400)
          .json({ success: false, message: err.message, error: err });
      }
      next();
    });
  },
  createCategory
);

/**
 * @swagger
 * /api/v1/admin/categories/{categoryId}:
 *   patch:
 *     summary: "[Admin] Update a category"
 *     description: Update category details including name, description, active status, display order, and image.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID to update
 *         example: 64abc123def456789
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               displayOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *               parentCategory:
 *                 type: string
 *                 nullable: true
 *               image:
 *                 type: string
 *                 format: binary
 *               removeImage:
 *                 type: boolean
 *                 description: Set to true to remove existing image
 *     responses:
 *       200:
 *         description: Category updated successfully
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
 *                   example: Category updated successfully
 *                 category:
 *                   type: object
 *       404:
 *         description: Category not found
 *       401:
 *         description: Unauthorized
 */
router.patch(
  "/categories/:categoryId",
  verifyToken,
  requireAdmin,
  (req, res, next) => {
    categoryImageUploader.single("image")(req, res, function (err) {
      if (err) {
        console.error("❌ Category image upload error:", err);
        return res
          .status(400)
          .json({ success: false, message: err.message, error: err });
      }
      next();
    });
  },
  updateCategory
);

/**
 * @swagger
 * /api/v1/admin/categories/{categoryId}:
 *   delete:
 *     summary: "[Admin] Delete a category"
 *     description: Permanently delete a category. This action cannot be undone. Ensure no products are associated with this category.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID to delete
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Category deleted successfully
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
 *                   example: Category deleted successfully
 *       404:
 *         description: Category not found
 *       400:
 *         description: Cannot delete category with associated products
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/categories/:categoryId",
  verifyToken,
  requireAdmin,
  deleteCategory
);

module.exports = router;
