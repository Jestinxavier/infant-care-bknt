const express = require("express");
const router = express.Router();
const { getHomepage, getHomepageById } = require("../controllers/homepage");

/**
 * @swagger
 * tags:
 *   name: Homepage
 *   description: Homepage data endpoints
 */

/**
 * @swagger
 * /api/v1/homepage:
 *   get:
 *     summary: Get all homepage data
 *     tags: [Homepage]
 *     responses:
 *       200:
 *         description: Homepage data fetched successfully
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
 *                   example: Homepage data fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: number
 *       404:
 *         description: Homepage data not found
 *       500:
 *         description: Internal Server Error
 */
router.get("/", getHomepage);

/**
 * @swagger
 * /api/v1/homepage/{id}:
 *   get:
 *     summary: Get homepage data by ID
 *     tags: [Homepage]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Homepage document ID
 *     responses:
 *       200:
 *         description: Homepage data fetched successfully
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
 *                   example: Homepage data fetched successfully
 *                 data:
 *                   type: object
 *       404:
 *         description: Homepage data not found
 *       400:
 *         description: Invalid homepage ID format
 *       500:
 *         description: Internal Server Error
 */
router.get("/:id", getHomepageById);

module.exports = router;

