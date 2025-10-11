const express = require("express");
const router = express.Router();
const { createOrder } = require("../controllers/Order");

// POST /api/v1/orders/create
router.post("/create", createOrder);

module.exports = router;
