const express = require("express");
const { parser } = require("../config/cloudinary");
const verifyToken = require("../middlewares/authMiddleware");
const {updateVariant} = require("../controllers/Variant");

const router = express.Router();

// Update a variant
router.put(
  "/update",
  verifyToken,
  (req, res, next) => parser.any()(req, res, next),
  updateVariant
);

module.exports = router;
