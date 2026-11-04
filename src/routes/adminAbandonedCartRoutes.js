const express = require("express");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const { listAbandonedCarts } = require("../controllers/abandonedCartController");

const router = express.Router();

// GET /api/v1/admin/abandoned-carts?view=open|reminded|recovered
router.get("/", verifyToken, requireAdmin, listAbandonedCarts);

module.exports = router;
