const express = require("express");
const router = express.Router();
const {
  getAllFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  reorderFAQs,
} = require("../controllers/faqController");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

/**
 * @swagger
 * components:
 *   schemas:
 *     FAQ:
 *       type: object
 *       required:
 *         - question
 *         - answer
 *         - category
 *       properties:
 *         _id:
 *           type: string
 *           description: FAQ ID
 *         question:
 *           type: string
 *           description: The question
 *         answer:
 *           type: string
 *           description: The answer
 *         category:
 *           type: string
 *           enum: [Account, Payment, Delivery, Order, Support, General]
 *           description: Category of the FAQ
 *         isActive:
 *           type: boolean
 *           default: true
 *         displayOrder:
 *           type: number
 *           default: 0
 */

/**
 * @swagger
 * /api/v1/faqs:
 *   get:
 *     summary: Get all FAQs
 *     tags: [FAQs]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of FAQs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 faqs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FAQ'
 */
router.get("/", getAllFAQs);

/**
 * @swagger
 * /api/v1/faqs:
 *   post:
 *     summary: Create a new FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FAQ'
 *     responses:
 *       201:
 *         description: FAQ created successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server Error
 */
router.post("/", verifyToken, requireAdmin, createFAQ);
router.put("/reorder", verifyToken, requireAdmin, reorderFAQs);

/**
 * @swagger
 * /api/v1/faqs/{id}:
 *   put:
 *     summary: Update an FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FAQ'
 *     responses:
 *       200:
 *         description: FAQ updated successfully
 *       404:
 *         description: FAQ not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", verifyToken, requireAdmin, updateFAQ);

/**
 * @swagger
 * /api/v1/faqs/{id}:
 *   delete:
 *     summary: Delete an FAQ
 *     tags: [FAQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FAQ deleted successfully
 *       404:
 *         description: FAQ not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", verifyToken, requireAdmin, deleteFAQ);

module.exports = router;
