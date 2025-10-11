const express = require("express");
const router = express.Router();
const { createAddress } = require("../controllers/address");
router.post("/create", createAddress);

module.exports = router;
