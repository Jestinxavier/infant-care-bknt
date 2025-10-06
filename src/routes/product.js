const express = require("express");
const { parser } = require("../config/cloudinary");
const { createProduct } = require("../controllers/product");

const router = express.Router();

// Use `parser.array` to accept multiple images (field name must match Postman/frontend)
router.post("/create", (req,res,next)=>{console.log("first**********") 
    next()},(req, res, next) => {
    parser.any()(req, res, function (err) {
      if (err) {
        console.error("❌ Multer/Cloudinary Error:", err);
        return res.status(400).json({ message: "Upload error", error: err });
      }
      console.log("✅ Multer parsing done");
      next();
    });
  } , createProduct );

module.exports = router;
