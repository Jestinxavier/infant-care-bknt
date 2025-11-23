// routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const {
  createOrGetCart,
  getCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearCart,
  mergeGuestCart,
} = require("../controllers/cart/cartController");
const { cartInitializer } = require("../middleware/cartInitializer");

// Apply cart initializer to all routes
router.use(cartInitializer);

/**
 * @swagger
 * /api/v1/cart:
 *   post:
 *     summary: Create or get cart
 *     tags: [Cart]
 *     description: |
 *       Creates a new cart or returns existing cart if cartId is provided.
 *       If no cartId cookie exists, a new cart is automatically created and cart_id cookie is set.
 *       The cart_id cookie is HTTP-only and secure (HTTPS in production).
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartId:
 *                 type: string
 *                 description: Optional existing cart ID (format: cart_<nanoid>)
 *                 example: cart_a1b2c3d4e5f6g7h8i9j0k
 *     responses:
 *       200:
 *         description: Cart created or retrieved successfully
 *         headers:
 *           Set-Cookie:
 *             description: cart_id cookie is set if new cart is created
 *             schema:
 *               type: string
 *               example: cart_id=cart_a1b2c3d4e5f6g7h8i9j0k; HttpOnly; Secure; SameSite=Lax
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *             examples:
 *               newCart:
 *                 summary: New cart created
 *                 value:
 *                   success: true
 *                   cart:
 *                     cartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *                     userId: null
 *                     items: []
 *                     subtotal: 0
 *                     tax: 0
 *                     shippingEstimate: 0
 *                     total: 0
 *                     itemCount: 0
 *               existingCart:
 *                 summary: Existing cart retrieved
 *                 value:
 *                   success: true
 *                   cart:
 *                     cartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *                     userId: null
 *                     items:
 *                       - _id: 64abc123def456789
 *                         productId: 64abc123def456789
 *                         variantId: variant_123
 *                         quantity: 2
 *                         priceSnapshot: 999
 *                         discountPriceSnapshot: 799
 *                         titleSnapshot: Premium Organic Cotton Infant Jumpsuit
 *                         imageSnapshot: https://picsum.photos/seed/red03/600
 *                         skuSnapshot: CJ-RED-0-3
 *                         attributesSnapshot:
 *                           color: red
 *                           size: 0-3
 *                     subtotal: 1998
 *                     tax: 0
 *                     shippingEstimate: 0
 *                     total: 1998
 *                     itemCount: 2
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/", createOrGetCart);

/**
 * @swagger
 * /api/v1/cart/{cartId}:
 *   get:
 *     summary: Get cart by ID
 *     tags: [Cart]
 *     description: Retrieves a cart by its cartId. Returns 404 if cart doesn't exist.
 *     parameters:
 *       - in: path
 *         name: cartId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^cart_[a-z0-9]{21}$'
 *         description: Cart ID (format: cart_<nanoid>)
 *         example: cart_a1b2c3d4e5f6g7h8i9j0k
 *     responses:
 *       200:
 *         description: Cart retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       400:
 *         description: Invalid cart ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Invalid cart ID format
 *       404:
 *         description: Cart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Cart not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:cartId", getCart);

/**
 * @swagger
 * /api/v1/cart/{cartId}/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     description: |
 *       Adds an item to the cart. If the item already exists (same productId and variantId),
 *       the quantity is increased. Validates stock availability before adding.
 *       Stores price, title, and image snapshots at the time of adding.
 *     parameters:
 *       - in: path
 *         name: cartId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^cart_[a-z0-9]{21}$'
 *         description: Cart ID
 *         example: cart_a1b2c3d4e5f6g7h8i9j0k
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddItemToCartRequest'
 *           examples:
 *             productWithVariant:
 *               summary: Add product with variant
 *               value:
 *                 productId: 64abc123def456789
 *                 variantId: variant_123
 *                 quantity: 2
 *             productWithoutVariant:
 *               summary: Add product without variant
 *               value:
 *                 productId: 64abc123def456789
 *                 quantity: 1
 *     responses:
 *       200:
 *         description: Item added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *             example:
 *               success: true
 *               message: Item added to cart
 *               cart:
 *                 cartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *                 items:
 *                   - _id: 64abc123def456789
 *                     productId: 64abc123def456789
 *                     variantId: variant_123
 *                     quantity: 2
 *                     priceSnapshot: 999
 *                     discountPriceSnapshot: 799
 *                     titleSnapshot: Premium Organic Cotton Infant Jumpsuit
 *                     imageSnapshot: https://picsum.photos/seed/red03/600
 *                 subtotal: 1998
 *                 total: 1998
 *                 itemCount: 2
 *       400:
 *         description: Invalid request, out of stock, or insufficient stock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               invalidRequest:
 *                 summary: Missing productId
 *                 value:
 *                   success: false
 *                   message: productId is required
 *               outOfStock:
 *                 summary: Item out of stock
 *                 value:
 *                   success: false
 *                   message: Variant is out of stock
 *               insufficientStock:
 *                 summary: Requested quantity exceeds available stock
 *                 value:
 *                   success: false
 *                   message: Only 5 items available. You already have 3 in cart.
 *       404:
 *         description: Cart or product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:cartId/items", addItemToCart);

/**
 * @swagger
 * /api/v1/cart/{cartId}/items/{itemId}:
 *   patch:
 *     summary: Update item quantity
 *     tags: [Cart]
 *     description: |
 *       Updates the quantity of an item in the cart. If quantity is set to 0,
 *       the item is automatically removed from the cart.
 *     parameters:
 *       - in: path
 *         name: cartId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^cart_[a-z0-9]{21}$'
 *         description: Cart ID
 *         example: cart_a1b2c3d4e5f6g7h8i9j0k
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart item ID (MongoDB ObjectId)
 *         example: 64abc123def456789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateItemQuantityRequest'
 *           examples:
 *             increaseQuantity:
 *               summary: Increase quantity
 *               value:
 *                 quantity: 5
 *             decreaseQuantity:
 *               summary: Decrease quantity
 *               value:
 *                 quantity: 1
 *             removeItem:
 *               summary: Remove item (set quantity to 0)
 *               value:
 *                 quantity: 0
 *     responses:
 *       200:
 *         description: Quantity updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *       400:
 *         description: Invalid quantity
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: Quantity cannot be negative
 *       404:
 *         description: Cart or item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               cartNotFound:
 *                 summary: Cart not found
 *                 value:
 *                   success: false
 *                   message: Cart not found
 *               itemNotFound:
 *                 summary: Item not found in cart
 *                 value:
 *                   success: false
 *                   message: Item not found in cart
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch("/:cartId/items/:itemId", updateItemQuantity);

/**
 * @swagger
 * /api/v1/cart/{cartId}/items/{itemId}:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
 *     description: Permanently removes an item from the cart.
 *     parameters:
 *       - in: path
 *         name: cartId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^cart_[a-z0-9]{21}$'
 *         description: Cart ID
 *         example: cart_a1b2c3d4e5f6g7h8i9j0k
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cart item ID (MongoDB ObjectId)
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Item removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *             example:
 *               success: true
 *               message: Item removed from cart
 *               cart:
 *                 cartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *                 items: []
 *                 subtotal: 0
 *                 total: 0
 *                 itemCount: 0
 *       400:
 *         description: Invalid cart ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Cart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete("/:cartId/items/:itemId", removeItemFromCart);

/**
 * @swagger
 * /api/v1/cart/{cartId}/clear:
 *   post:
 *     summary: Clear all items from cart
 *     tags: [Cart]
 *     description: Removes all items from the cart. The cart itself is not deleted.
 *     parameters:
 *       - in: path
 *         name: cartId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^cart_[a-z0-9]{21}$'
 *         description: Cart ID
 *         example: cart_a1b2c3d4e5f6g7h8i9j0k
 *     responses:
 *       200:
 *         description: Cart cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *             example:
 *               success: true
 *               message: Cart cleared
 *               cart:
 *                 cartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *                 items: []
 *                 subtotal: 0
 *                 tax: 0
 *                 shippingEstimate: 0
 *                 total: 0
 *                 itemCount: 0
 *       400:
 *         description: Invalid cart ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Cart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/:cartId/clear", clearCart);

/**
 * @swagger
 * /api/v1/cart/merge:
 *   post:
 *     summary: Merge guest cart into user cart
 *     tags: [Cart]
 *     description: |
 *       Merges items from a guest cart into an authenticated user's cart.
 *       If the same product+variant combination exists in both carts, quantities are combined.
 *       After merging, the guest cart is deleted.
 *       This endpoint should be called after user login to preserve guest cart items.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MergeCartRequest'
 *           example:
 *             guestCartId: cart_a1b2c3d4e5f6g7h8i9j0k
 *             userCartId: cart_z9y8x7w6v5u4t3s2r1q0p
 *     responses:
 *       200:
 *         description: Carts merged successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CartResponse'
 *             example:
 *               success: true
 *               message: Carts merged successfully
 *               cart:
 *                 cartId: cart_z9y8x7w6v5u4t3s2r1q0p
 *                 userId: 64abc123def456789
 *                 items:
 *                   - _id: 64abc123def456789
 *                     productId: 64abc123def456789
 *                     variantId: variant_123
 *                     quantity: 5
 *                     priceSnapshot: 999
 *                     titleSnapshot: Premium Organic Cotton Infant Jumpsuit
 *                 subtotal: 4995
 *                 total: 4995
 *                 itemCount: 5
 *       400:
 *         description: Invalid cart ID format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: User must be authenticated
 *       403:
 *         description: User cart does not belong to authenticated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               message: User cart does not belong to authenticated user
 *       404:
 *         description: Cart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               guestCartNotFound:
 *                 summary: Guest cart not found
 *                 value:
 *                   success: false
 *                   message: Guest cart not found
 *               userCartNotFound:
 *                 summary: User cart not found
 *                 value:
 *                   success: false
 *                   message: User cart not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/merge", mergeGuestCart);

module.exports = router;
