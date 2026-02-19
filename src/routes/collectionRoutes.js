const express = require("express");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} = require("../controllers/collection/collectionController");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/", listCollections);
router.post("/", createCollection);
router.patch("/:id", updateCollection);
router.delete("/:id", deleteCollection);

module.exports = router;
