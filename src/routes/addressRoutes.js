const express = require("express");
const router = express.Router();
const {
  createAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
} = require("../controllers/address");

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
 *               - street
 *               - city
 *               - state
 *               - pincode
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
 *               houseName:
 *                 type: string
 *                 example: Green Villa
 *                 description: House/Building name (optional)
 *               street:
 *                 type: string
 *                 example: 123 Main Street
 *               landmark:
 *                 type: string
 *                 example: Near City Mall
 *                 description: Landmark for easy location (optional)
 *               addressLine1:
 *                 type: string
 *                 example: 123 Main Street
 *                 description: Address line 1 (kept for backward compatibility, use street instead)
 *               addressLine2:
 *                 type: string
 *                 example: Near City Mall
 *                 description: Address line 2 (kept for backward compatibility, use landmark instead)
 *               city:
 *                 type: string
 *                 example: Mumbai
 *               state:
 *                 type: string
 *                 example: Maharashtra
 *               district:
 *                 type: string
 *                 example: '1'
 *                 description: District ID or name (optional)
 *               pincode:
 *                 type: string
 *                 example: '400001'
 *               postalCode:
 *                 type: string
 *                 example: '400001'
 *                 description: Postal code (kept for backward compatibility, use pincode instead)
 *               country:
 *                 type: string
 *                 example: India
 *                 default: India
 *               isDefault:
 *                 type: boolean
 *                 example: false
 *               nickname:
 *                 type: string
 *                 example: Home
 *                 description: Nickname for the address (e.g., Home, Office, Front Home)
 *                 default: Home
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
 *                 message:
 *                   type: string
 *                   example: ✅ Addresses fetched successfully
 *       400:
 *         description: User ID is required
 *       404:
 *         description: No addresses found
 */
router.post("/:userId", getAddresses);

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
 *               houseName:
 *                 type: string
 *                 example: Blue Villa
 *                 description: House/Building name (optional)
 *               street:
 *                 type: string
 *                 example: 456 New Street
 *               landmark:
 *                 type: string
 *                 example: Near Park
 *                 description: Landmark for easy location (optional)
 *               addressLine1:
 *                 type: string
 *                 example: 456 New Street
 *                 description: Address line 1 (kept for backward compatibility, use street instead)
 *               addressLine2:
 *                 type: string
 *                 example: Suite 5C
 *                 description: Address line 2 (kept for backward compatibility, use landmark instead)
 *               city:
 *                 type: string
 *                 example: Delhi
 *               state:
 *                 type: string
 *                 example: Delhi
 *               pincode:
 *                 type: string
 *                 example: '110001'
 *               postalCode:
 *                 type: string
 *                 example: '110001'
 *                 description: Postal code (kept for backward compatibility, use pincode instead)
 *               country:
 *                 type: string
 *                 example: India
 *                 default: India
 *               isDefault:
 *                 type: boolean
 *                 example: false
 *               nickname:
 *                 type: string
 *                 example: Office
 *                 description: Nickname for the address (e.g., Home, Office, Front Home)
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

/**
 * @swagger
 * /api/v1/addresses/{addressId}:
 *   delete:
 *     summary: Delete an address
 *     tags: [Addresses]
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID to delete
 *         example: 64abc123def456791
 *     responses:
 *       200:
 *         description: Address deleted successfully
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
 *                   example: ✅ Address deleted successfully
 *       400:
 *         description: Address ID is required
 *       404:
 *         description: Address not found
 *       500:
 *         description: Internal Server Error
 */
router.delete("/:addressId", deleteAddress);
module.exports = router;
