const express = require("express");
const verifyToken = require("../../middlewares/authMiddleware");
const requireAdmin = require("../../middlewares/adminMiddleware");
const requirePermission = require("../../middlewares/permissionMiddleware");
const posController = require("./pos.admin.controller");

const router = express.Router();

// Source names for order filters/reports. Registered before the router-wide
// edit:orders guard below: anyone who can view orders can filter by source.
router.get(
  "/source-options",
  verifyToken,
  requireAdmin,
  requirePermission("view:orders"),
  posController.getSourceOptions,
);

// Selling at the counter creates orders, so it needs order-edit rights
router.use(verifyToken, requireAdmin, requirePermission("edit:orders"));

// GET /api/v1/admin/pos/config — store details for the receipt + tenders
router.get("/config", posController.getConfig);

// GET /api/v1/admin/pos/items?q=<title or SKU/barcode>
router.get("/items", posController.searchItems);

// POST /api/v1/admin/pos/sales — requires an Idempotency-Key header
router.post("/sales", posController.createSale);

// Extra charge types (Shipping, Gift wrapping...): owners only. Cashiers get
// the active ones through /config and can only apply them to a bill.
router.get("/charges", requirePermission("manage:pos_settings"), posController.getCharges);
router.put("/charges", requirePermission("manage:pos_settings"), posController.updateCharges);

// Customer sources (Walk-in, WhatsApp, Instagram...): owners manage the list,
// cashiers get the active ones through /config and must pick one per sale.
router.get("/sources", requirePermission("manage:pos_settings"), posController.getSources);
router.put("/sources", requirePermission("manage:pos_settings"), posController.updateSources);

module.exports = router;
