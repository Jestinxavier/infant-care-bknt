const express = require("express");
const router = express.Router();
const { createAddress,getAddresses,updateAddress } = require("../controllers/address");

/**
 * @swagger
 * /api/v1/addresses/create:
 *   post:
 *     summary: Create a new address
 *     tags: [Addresses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - fullName
 *               - phone
 *               - addressLine1
 *               - city
 *               - state
 *               - pincode
 *               - country
 *             properties:
 *               userId:
 *                 type: string
 *                 example: 64abc123def456789
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               phone:
 *                 type: string
 *                 example: '9876543210'
 *               addressLine1:
 *                 type: string
 *                 example: 123 Main Street
 *               addressLine2:
 *                 type: string
 *                 example: Apt 4B
 *               city:
 *                 type: string
 *                 example: Mumbai
 *               state:
 *                 type: string
 *                 example: Maharashtra
 *               pincode:
 *                 type: string
 *                 example: '400001'
 *               country:
 *                 type: string
 *                 example: India
 *     responses:
 *       201:
 *         description: Address created successfully
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
 *                   example: Address created successfully
 *                 address:
 *                   $ref: '#/components/schemas/Address'
 *       400:
 *         description: Validation error
 */
router.post("/create", createAddress);

/**
 * @swagger
 * /api/v1/addresses/{userId}:
 *   get:
 *     summary: Get all addresses for a user
 *     tags: [Addresses]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *         example: 64abc123def456789
 *     responses:
 *       200:
 *         description: Addresses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 addresses:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Address'
 *       404:
 *         description: No addresses found
 */
router.get("/:userId", getAddresses);

/**
 * @swagger
 * /api/v1/addresses/{addressId}:
 *   put:
 *     summary: Update an existing address
 *     tags: [Addresses]
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID to update
 *         example: 64abc123def456791
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe Jr.
 *               phone:
 *                 type: string
 *                 example: '9876543211'
 *               addressLine1:
 *                 type: string
 *                 example: 456 New Street
 *               addressLine2:
 *                 type: string
 *                 example: Suite 5C
 *               city:
 *                 type: string
 *                 example: Delhi
 *               state:
 *                 type: string
 *                 example: Delhi
 *               pincode:
 *                 type: string
 *                 example: '110001'
 *               country:
 *                 type: string
 *                 example: India
 *     responses:
 *       200:
 *         description: Address updated successfully
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
 *                   example: Address updated successfully
 *                 address:
 *                   $ref: '#/components/schemas/Address'
 *       404:
 *         description: Address not found
 */
router.put("/:addressId", updateAddress);
module.exports = router;
