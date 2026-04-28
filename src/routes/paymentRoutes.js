const express = require("express");
const router = express.Router();
const { optionalVerifyToken } = require("../middlewares/authMiddleware");
const {
  getPaymentOptions,
} = require("../controllers/payment/paymentController");

router.get("/options", optionalVerifyToken, getPaymentOptions);

module.exports = router;
