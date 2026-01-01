const express = require("express");
const router = express.Router();
const {
  registerInterest,
} = require("../controllers/stockNotification/stockNotificationController");

/**
 * @swagger
 * /api/v1/stock-notify/register:
 *   post:
 *     summary: Register interest for out of stock items
 *     tags: [Stock Notification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - variantId
 *               - email
 *             properties:
 *               productId:
 *                 type: string
 *               variantId:
 *                 type: string
 *               email:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Registered successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Product/Variant not found
 */
router.post("/register", registerInterest);

module.exports = router;
