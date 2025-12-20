const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
    getAllDeliveryPartners,
    createDeliveryPartner,
    updateDeliveryPartner,
    deleteDeliveryPartner
} = require("../controllers/deliveryPartner");

/**
 * @swagger
 * tags:
 *   name: Delivery Partners
 *   description: "[Admin] Delivery partner management endpoints"
 */

/**
 * @swagger
 * /api/v1/admin/delivery-partners:
 *   get:
 *     summary: "[Admin] Get all delivery partners"
 *     tags: [Delivery Partners]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Delivery partners retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       contactPerson:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       email:
 *                         type: string
 *                       website:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *   post:
 *     summary: "[Admin] Create a new delivery partner"
 *     tags: [Delivery Partners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               contactPerson:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               website:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Delivery partner created successfully
 *       400:
 *         description: Validation error
 *
 * /api/v1/admin/delivery-partners/{id}:
 *   patch:
 *     summary: "[Admin] Update a delivery partner"
 *     tags: [Delivery Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contactPerson:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               website:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Delivery partner updated successfully
 *       404:
 *         description: Partner not found
 *   delete:
 *     summary: "[Admin] Delete a delivery partner"
 *     tags: [Delivery Partners]
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
 *         description: Delivery partner deleted successfully
 *       404:
 *         description: Partner not found
 */

// All routes require Admin authentication
router.use(verifyToken, requireAdmin);

router.get("/", getAllDeliveryPartners);
router.post("/", createDeliveryPartner);
router.patch("/:id", updateDeliveryPartner);
router.delete("/:id", deleteDeliveryPartner);

module.exports = router;
