const express = require("express");
const router = express.Router();
const { getFooter } = require("../controllers/footer");

/**
 * @swagger
 * tags:
 *   name: Footer
 *   description: Footer data endpoints
 */

/**
 * @swagger
 * /api/v1/footer:
 *   get:
 *     summary: Get footer data
 *     tags: [Footer]
 *     responses:
 *       200:
 *         description: Footer data fetched successfully
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
 *                   example: Footer data fetched successfully
 *                 data:
 *                   type: object
 *                   description: Footer content with features and footer sections
 *                   properties:
 *                     features:
 *                       type: array
 *                       items:
 *                         type: object
 *                     footer:
 *                       type: object
 *                       properties:
 *                         sections:
 *                           type: array
 *                         social:
 *                           type: array
 *                         legal:
 *                           type: object
 *       500:
 *         description: Internal Server Error
 */
router.get("/", getFooter);

module.exports = router;

