/**
 * Attribute Routes
 * Public and admin endpoints for product attribute definitions
 */

const express = require("express");
const router = express.Router();
const {
  getAllAttributes,
  getAttributeById,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  addAllowedValue,
  updateAllowedValue,
  removeAllowedValue,
} = require("../controllers/attributeController");

// Import auth middleware (matching existing patterns in the project)
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

// ============================================
// PUBLIC ROUTES
// ============================================

// GET /api/v1/attributes - List all attributes
router.get("/", getAllAttributes);

// GET /api/v1/attributes/:id - Get single attribute
router.get("/:id", getAttributeById);

// ============================================
// ADMIN ROUTES (require authentication)
// ============================================

// POST /api/v1/attributes - Create new attribute (admin only)
router.post("/", verifyToken, requireAdmin, createAttribute);

// PATCH /api/v1/attributes/:id - Update attribute (admin only)
router.patch("/:id", verifyToken, requireAdmin, updateAttribute);

// DELETE /api/v1/attributes/:id - Delete attribute (admin only)
router.delete("/:id", verifyToken, requireAdmin, deleteAttribute);

// ============================================
// ATTRIBUTE VALUES MANAGEMENT (admin only)
// ============================================

// POST /api/v1/attributes/:id/values - Add allowed value
router.post("/:id/values", verifyToken, requireAdmin, addAllowedValue);

// PATCH /api/v1/attributes/:id/values/:valueCode - Update allowed value
router.patch("/:id/values/:valueCode", verifyToken, requireAdmin, updateAllowedValue);

// DELETE /api/v1/attributes/:id/values/:valueCode - Remove allowed value
router.delete("/:id/values/:valueCode", verifyToken, requireAdmin, removeAllowedValue);

module.exports = router;
