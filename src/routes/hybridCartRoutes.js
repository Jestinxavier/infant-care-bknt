// routes/hybridCartRoutes.js
const express = require("express");
const router = express.Router();
const { validateCart } = require("../middleware/validateCart");
const {
  createCart,
  setCookie,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  getCount,
  getItems,
  getPriceSummary,
  getProductData,
  getSummary,
  mergeCart,
} = require("../controllers/cart/hybridCartController");
const verifyToken = require("../middlewares/authMiddleware");

/**
 * @swagger
 * /api/v1/cart/create:
 *   post:
 *     summary: Create cart server-side (optional)
 *     tags: [Cart]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cart created successfully
 */
router.post("/create", createCart);

/**
 * @swagger
 * /api/v1/cart/set-cookie:
 *   post:
 *     summary: Set HTTP-only cookie for client-generated cartId
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cartId
 *             properties:
 *               cartId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cookie set successfully
 */
router.post("/set-cookie", setCookie);

/**
 * @swagger
 * /api/v1/cart/get:
 *   post:
 *     summary: Get full cart by cookie/cartId
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
 */
router.post("/get", validateCart, getCart);

/**
 * @swagger
 * /api/v1/cart/add-item:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - item
 *             properties:
 *               item:
 *                 type: object
 *                 required:
 *                   - productId
 *                 properties:
 *                   productId:
 *                     type: string
 *                   variantId:
 *                     type: string
 *                   quantity:
 *                     type: number
 *     responses:
 *       200:
 *         description: Item added successfully
 */
router.post("/add-item", validateCart, addItem);

/**
 * @swagger
 * /api/v1/cart/update-item:
 *   patch:
 *     summary: Update item quantity
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - changes
 *             properties:
 *               itemId:
 *                 type: string
 *               changes:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *     responses:
 *       200:
 *         description: Item updated successfully
 */
router.patch("/update-item", validateCart, updateItem);

/**
 * @swagger
 * /api/v1/cart/remove-item:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *             properties:
 *               itemId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item removed successfully
 */
router.delete("/remove-item", validateCart, removeItem);

/**
 * @swagger
 * /api/v1/cart/clear:
 *   post:
 *     summary: Clear all items from cart
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Cart cleared successfully
 */
router.post("/clear", validateCart, clearCart);

/**
 * @swagger
 * /api/v1/cart/count:
 *   get:
 *     summary: Get total item count
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *   post:
 *     summary: Get total item count (POST to avoid caching)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Count retrieved successfully
 */
router.get("/count", validateCart, getCount);
router.post("/count", validateCart, getCount);

/**
 * @swagger
 * /api/v1/cart/items:
 *   get:
 *     summary: Get list of cart items
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *   post:
 *     summary: Get list of cart items (POST to avoid caching)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 */
router.get("/items", validateCart, getItems);
router.post("/items", validateCart, getItems);

/**
 * @swagger
 * /api/v1/cart/price-summary:
 *   get:
 *     summary: Get price summary
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Price summary retrieved successfully
 *   post:
 *     summary: Get price summary (POST to avoid caching)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Price summary retrieved successfully
 */
router.get("/price-summary", validateCart, getPriceSummary);
router.post("/price-summary", validateCart, getPriceSummary);

/**
 * @swagger
 * /api/v1/cart/product-data:
 *   get:
 *     summary: Get detailed product data for items
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Product data retrieved successfully
 *   post:
 *     summary: Get detailed product data for items (POST to avoid caching)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Product data retrieved successfully
 */
router.get("/product-data", validateCart, getProductData);
router.post("/product-data", validateCart, getProductData);

/**
 * @swagger
 * /api/v1/cart/summary:
 *   get:
 *     summary: Get combined summary (count + price-summary)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Summary retrieved successfully
 *   post:
 *     summary: Get combined summary (POST to avoid caching)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Summary retrieved successfully
 */
router.get("/summary", validateCart, getSummary);
router.post("/summary", validateCart, getSummary);

/**
 * @swagger
 * /api/v1/cart/merge:
 *   post:
 *     summary: Merge guest cart into user cart on login
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart merged successfully
 */
router.post("/merge", verifyToken, validateCart, mergeCart);

module.exports = router;

