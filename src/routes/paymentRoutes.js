const express = require("express");
const router = express.Router();
const { 
  initPhonePePayment, 
  phonePeCallback, 
  checkPaymentStatus 
} = require("../controllers/payment/phonePeController");

/**
 * @swagger
 * /api/v1/payments/phonepe/init:
 *   post:
 *     summary: Initialize PhonePe payment
 *     description: Creates a PhonePe payment request and returns the payment URL for user redirection
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - amount
 *               - userId
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ID from create order response
 *                 example: 64abc123def456792
 *               amount:
 *                 type: number
 *                 description: Amount in rupees (will be converted to paise)
 *                 example: 1500
 *               userId:
 *                 type: string
 *                 example: 64abc123def456789
 *               userPhone:
 *                 type: string
 *                 description: User's phone number (optional)
 *                 example: '9876543210'
 *               userName:
 *                 type: string
 *                 description: User's name (optional)
 *                 example: John Doe
 *     responses:
 *       200:
 *         description: Payment initiated successfully
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
 *                   example: Payment initiated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                       description: PhonePe payment page URL
 *                       example: https://mercury-uat.phonepe.com/transact/pg?token=...
 *                     transactionId:
 *                       type: string
 *                       example: TXN_64abc123def456792_1234567890
 *                     orderId:
 *                       type: string
 *                       example: 64abc123def456792
 *       400:
 *         description: Invalid request or payment init failed
 *       404:
 *         description: Order not found
 */
// POST /api/v1/payments/phonepe/init - Initialize PhonePe payment
router.post("/phonepe/init", initPhonePePayment);

/**
 * @swagger
 * /api/v1/payments/phonepe/callback:
 *   post:
 *     summary: PhonePe payment callback (Webhook)
 *     description: This endpoint is automatically called by PhonePe after payment completion. Do not call manually.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               response:
 *                 type: string
 *                 description: Base64 encoded payment response from PhonePe
 *     responses:
 *       200:
 *         description: Payment successful
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
 *                   example: Payment successful
 *                 paymentId:
 *                   type: string
 *       400:
 *         description: Payment failed or invalid callback data
 */
// POST /api/v1/payments/phonepe/callback - PhonePe callback handler
router.post("/phonepe/callback", phonePeCallback);

/**
 * @swagger
 * /api/v1/payments/phonepe/status/{transactionId}:
 *   get:
 *     summary: Check PhonePe payment status
 *     description: Manually verify payment status with PhonePe
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID from payment init response
 *         example: TXN_64abc123def456792_1234567890
 *     responses:
 *       200:
 *         description: Payment status retrieved successfully
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
 *                   example: Payment status retrieved
 *                 data:
 *                   type: object
 *                   properties:
 *                     state:
 *                       type: string
 *                       enum: [PENDING, COMPLETED, FAILED]
 *                       example: COMPLETED
 *                     responseCode:
 *                       type: string
 *                       example: SUCCESS
 *                     amount:
 *                       type: number
 *                       description: Amount in paise
 *                       example: 150000
 *       400:
 *         description: Failed to check payment status
 *       404:
 *         description: Transaction not found
 */
// GET /api/v1/payments/phonepe/status/:transactionId - Check payment status
router.get("/phonepe/status/:transactionId", checkPaymentStatus);

module.exports = router;
