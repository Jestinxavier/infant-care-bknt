const express = require("express");
const router = express.Router();
const { createAddress,getAddresses,updateAddress } = require("../controllers/address");
router.post("/create", createAddress);
router.get("/:userId", getAddresses); 
router.put("/:addressId", updateAddress);
module.exports = router;
