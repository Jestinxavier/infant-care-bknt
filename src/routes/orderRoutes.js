const express = require("express");
const router = express.Router();
const { createOrder } = require("../controllers/Order");

/**
 * @swagger
 * /api/v1/orders/create:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - items
 *               - paymentMethod
 *             properties:
 *               userId:
 *                 type: string
 *                 example: 64abc123def456789
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantId:
 *                       type: string
 *                       example: 64abc123def456790
 *                     quantity:
 *                       type: number
 *                       example: 2
 *               addressId:
 *                 type: string
 *                 description: Existing address ID
 *                 example: 64abc123def456791
 *               newAddress:
 *                 type: object
 *                 description: Create new address (if addressId not provided)
 *                 properties:
 *                   fullName:
 *                     type: string
 *                     example: John Doe
 *                   phone:
 *                     type: string
 *                     example: '9876543210'
 *                   addressLine1:
 *                     type: string
 *                     example: 123 Main Street
 *                   city:
 *                     type: string
 *                     example: Mumbai
 *                   state:
 *                     type: string
 *                     example: Maharashtra
 *                   pincode:
 *                     type: string
 *                     example: '400001'
 *                   country:
 *                     type: string
 *                     example: India
 *               paymentMethod:
 *                 type: string
 *                 enum: [COD, Razorpay, Stripe, PhonePe]
 *                 example: PhonePe
 *     responses:
 *       201:
 *         description: Order created successfully
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
 *                   example: Order created successfully
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *                 requiresPayment:
 *                   type: boolean
 *                   description: True if payment needs to be initiated (for PhonePe)
 *                   example: true
 *                 paymentMethod:
 *                   type: string
 *                   example: PhonePe
 *       400:
 *         description: Validation error
 *       404:
 *         description: Variant or address not found
 */
// POST /api/v1/orders/create
router.post("/create", createOrder);

module.exports = router;
