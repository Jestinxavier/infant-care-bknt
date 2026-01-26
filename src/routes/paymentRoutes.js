const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const {
  getPaymentOptions,
} = require("../controllers/payment/paymentController");

router.get("/options", verifyToken, getPaymentOptions);

module.exports = router;
