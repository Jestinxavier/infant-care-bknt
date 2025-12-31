const express = require("express");
const router = express.Router();
const {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} = require("../controllers/faqCategoryController");
const { fixDisplayOrder } = require("../controllers/fixCategoryDisplayOrder");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");

router.get("/", getAllCategories);
router.post("/", verifyToken, requireAdmin, createCategory);
router.put("/fix-display-order", verifyToken, requireAdmin, fixDisplayOrder);
router.put("/reorder", verifyToken, requireAdmin, reorderCategories);
router.put("/:id", verifyToken, requireAdmin, updateCategory);
router.delete("/:id", verifyToken, requireAdmin, deleteCategory);

module.exports = router;
