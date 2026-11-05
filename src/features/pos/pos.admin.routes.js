const express = require("express");
const verifyToken = require("../../middlewares/authMiddleware");
const requireAdmin = require("../../middlewares/adminMiddleware");
const requirePermission = require("../../middlewares/permissionMiddleware");
const posController = require("./pos.admin.controller");

const router = express.Router();

// Selling at the counter creates orders, so it needs order-edit rights
router.use(verifyToken, requireAdmin, requirePermission("edit:orders"));

// GET /api/v1/admin/pos/config — store details for the receipt + tenders
router.get("/config", posController.getConfig);

// GET /api/v1/admin/pos/items?q=<title or SKU/barcode>
router.get("/items", posController.searchItems);

// POST /api/v1/admin/pos/sales — requires an Idempotency-Key header
router.post("/sales", posController.createSale);

module.exports = router;
