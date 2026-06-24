const express = require("express");
const router = express.Router();
const { optionalVerifyToken } = require("../middlewares/authMiddleware");
const {
  getPaymentOptions,
} = require("../controllers/payment/paymentController");
const {
  verifyPaymentSignature,
} = require("../controllers/payment/razorpaySDK");

router.get("/options", optionalVerifyToken, getPaymentOptions);
router.post("/razorpay/verify", optionalVerifyToken, verifyPaymentSignature);

module.exports = router;
