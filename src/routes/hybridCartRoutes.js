// routes/hybridCartRoutes.js
const express = require("express");
const router = express.Router();
const { validateCart } = require("../middleware/validateCart");
const {
  createCart,
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
  applyCoupon,
  removeCoupon,
  getAvailableCoupons,
  recoverCart,
} = require("../controllers/cart/hybridCartController");
const startCheckout = require("../controllers/cart/startCheckout");
const verifyToken = require("../middlewares/authMiddleware");
const { optionalVerifyToken } = require("../middlewares/authMiddleware");

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
 * /api/v1/cart/get:
 *   post:
 *     summary: Get full cart by cookie/cartId
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
 *   head:
 *     summary: Validate if cart exists (lightweight)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Cart exists
 *       404:
 *         description: Cart not found
 */
router.post("/get", optionalVerifyToken, validateCart, getCart);
router.head("/get", optionalVerifyToken, validateCart, getCart);

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
router.post("/add-item", optionalVerifyToken, validateCart, addItem);

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
 *               - sku
 *               - changes
 *             properties:
 *               sku:
 *                 type: string
 *                 description: Product/variant SKU (skuSnapshot)
 *               selectedGiftSku:
 *                 type: string
 *                 description: For bundle with gift slot
 *               changes:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *     responses:
 *       200:
 *         description: Item updated successfully
 */
router.patch("/update-item", optionalVerifyToken, validateCart, updateItem);

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
 *               - sku
 *             properties:
 *               sku:
 *                 type: string
 *                 description: Product/variant SKU (skuSnapshot)
 *               selectedGiftSku:
 *                 type: string
 *                 description: For bundle with gift slot
 *     responses:
 *       200:
 *         description: Item removed successfully
 */
router.delete("/remove-item", optionalVerifyToken, validateCart, removeItem);

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
router.post("/clear", optionalVerifyToken, validateCart, clearCart);

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
router.get("/count", optionalVerifyToken, validateCart, getCount);
router.post("/count", optionalVerifyToken, validateCart, getCount);

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
router.get("/items", optionalVerifyToken, validateCart, getItems);
router.post("/items", optionalVerifyToken, validateCart, getItems);

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
router.get(
  "/price-summary",
  optionalVerifyToken,
  validateCart,
  getPriceSummary
);
router.post(
  "/price-summary",
  optionalVerifyToken,
  validateCart,
  getPriceSummary
);

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
router.get("/product-data", optionalVerifyToken, validateCart, getProductData);
router.post("/product-data", optionalVerifyToken, validateCart, getProductData);

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
router.get("/summary", optionalVerifyToken, validateCart, getSummary);
router.post("/summary", optionalVerifyToken, validateCart, getSummary);

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

/**
 * @swagger
 * /api/v1/cart/apply-coupon:
 *   post:
 *     summary: Apply coupon to cart
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Coupon applied successfully
 *       400:
 *         description: Invalid coupon or requirements not met
 */
router.post("/apply-coupon", optionalVerifyToken, validateCart, applyCoupon);

/**
 * @swagger
 * /api/v1/cart/remove-coupon:
 *   delete:
 *     summary: Remove coupon from cart
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Coupon removed successfully
 */
router.delete(
  "/remove-coupon",
  optionalVerifyToken,
  validateCart,
  removeCoupon
);

/**
 * @swagger
 * /api/v1/cart/start-checkout:
 *   post:
 *     summary: Start checkout - Lock cart for atomic order creation
 *     tags: [Cart]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Checkout started successfully
 *       409:
 *         description: Checkout already in progress or cart ordered
 */
router.post("/start-checkout", startCheckout);

/**
 * @swagger
 * /api/v1/cart/coupons:
 *   get:
 *     summary: Get list of available coupons
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: List of available coupons
 */
router.get("/coupons", optionalVerifyToken, getAvailableCoupons);

/**
 * @swagger
 * /api/v1/cart/recover:
 *   post:
 *     summary: Recover locked cart (clone to new ID)
 *     tags: [Cart]
 *     responses:
 *       200:
 *         description: Cart recovered successfully
 */
router.post("/recover", optionalVerifyToken, validateCart, recoverCart);

module.exports = router;
