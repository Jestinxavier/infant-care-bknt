const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/authMiddleware");
const { getWishlist, getWishlistProducts, toggleWishlist } = require("../controllers/wishlist/wishlistController");

router.get("/", verifyToken, getWishlist);
router.get("/products", verifyToken, getWishlistProducts);
router.post("/toggle", verifyToken, toggleWishlist);

module.exports = router;
