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

// All routes require Admin authentication
router.use(verifyToken, requireAdmin);

router.get("/", getAllDeliveryPartners);
router.post("/", createDeliveryPartner);
router.patch("/:id", updateDeliveryPartner);
router.delete("/:id", deleteDeliveryPartner);

module.exports = router;
