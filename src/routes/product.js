const express = require("express");
const { parser } = require("../config/cloudinary");
const { createProduct,updateProduct } = require("../controllers/product");
const verifyToken = require("../middlewares/authMiddleware");
const router = express.Router();

// Use `parser.array` to accept multiple images (field name must match Postman/frontend)
router.post("/create",verifyToken,(req, res, next) => {
    parser.any()(req, res, function (err) {
      if (err) {
        console.error("❌ Multer/Cloudinary Error:", err);
        return res.status(400).json({ message: "Upload error", error: err });
      }
      console.log("✅ Multer parsing done");
      next();
    });
  } , createProduct );

  // Update product
router.put(
  "/update",
  verifyToken,
  (req, res, next) => parser.any()(req, res, next),
  updateProduct
);
module.exports = router;
