const express = require("express");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/adminMiddleware");
const {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  listCollectionRedirects,
  deleteCollectionRedirect,
} = require("../controllers/collection/collectionController");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/", listCollections);
router.post("/", createCollection);
router.patch("/:id", updateCollection);
router.delete("/:id", deleteCollection);

/**
 * Slug-rename history. Mounted before "/:id" style routes above are irrelevant
 * here (they are all method+path specific), but kept last for readability.
 */
router.get("/redirects", listCollectionRedirects);
router.delete("/redirects/:id", deleteCollectionRedirect);

module.exports = router;