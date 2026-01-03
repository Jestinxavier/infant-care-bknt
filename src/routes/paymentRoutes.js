const express = require("express");
const router = express.Router();
const {
  initPhonePePayment,
  phonePeCallback,
  phonePeRedirect,
  checkPaymentStatus,
  initiatePhonePeRefund,
  getPhonePeRefundStatus,
} = require("../controllers/payment");

const phonepeSDK = require("../controllers/payment/phonepeSDK");

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
 *                 example: 1199
 *               userId:
 *                 type: string
 *                 example: 68f66b14710c36437149f73c
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
 *       400:
 *         description: Payment failed or invalid callback data
 */
// POST /api/v1/payments/phonepe/callback - PhonePe callback handler
router.post("/phonepe/callback", phonePeCallback);

// GET /api/v1/payments/phonepe/redirect - PhonePe redirect handler
router.get("/phonepe/redirect", phonePeRedirect);

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

/**
 * @swagger
 * /api/v1/payments/phonepe/refund:
 *   post:
 *     summary: Initiate PhonePe refund
 *     description: Creates a refund request for a completed PhonePe payment
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
 *             properties:
 *               orderId:
 *                 type: string
 *                 example: 64abc123def456792
 *               amount:
 *                 type: number
 *                 description: Amount to refund in rupees
 *                 example: 500
 *     responses:
 *       200:
 *         description: Refund initiated successfully
 *       400:
 *         description: Invalid request or refund failed
 *       404:
 *         description: Payment record not found
 */
router.post("/phonepe/refund", initiatePhonePeRefund);

/**
 * @swagger
 * /api/v1/payments/phonepe/refund/status/{refundId}:
 *   get:
 *     summary: Check PhonePe refund status
 *     description: Manually verify refund status with PhonePe
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *         description: Refund ID from refund init response
 *     responses:
 *       200:
 *         description: Refund status retrieved successfully
 */
router.get("/phonepe/refund/status/:refundId", getPhonePeRefundStatus);

router.post("/phonepeSdk/checkout", phonepeSDK.initiatePayment);

module.exports = router;
