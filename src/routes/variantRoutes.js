const express = require("express");
const { parser } = require("../config/cloudinary");
const verifyToken = require("../middlewares/authMiddleware");
const {updateVariant} = require("../controllers/Variant");

const router = express.Router();

/**
 * @swagger
 * /api/v1/variants/update:
 *   put:
 *     summary: Update a product variant
 *     tags: [Variants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - variantId
 *             properties:
 *               variantId:
 *                 type: string
 *                 description: Variant ID to update
 *                 example: 64abc123def456790
 *               size:
 *                 type: string
 *                 example: L
 *               color:
 *                 type: string
 *                 example: Blue
 *               price:
 *                 type: number
 *                 example: 1299
 *               stock:
 *                 type: number
 *                 example: 100
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Variant images (optional)
 *     responses:
 *       200:
 *         description: Variant updated successfully
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
 *                   example: Variant updated successfully
 *                 variant:
 *                   $ref: '#/components/schemas/Variant'
 *       404:
 *         description: Variant not found
 *       401:
 *         description: Unauthorized
 */
// Update a variant
router.put(
  "/update",
  verifyToken,
  (req, res, next) => parser.any()(req, res, next),
  updateVariant
);

module.exports = router;
