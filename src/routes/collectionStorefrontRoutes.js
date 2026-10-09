const express = require("express");
const { getCollectionBySlug } = require("../controllers/collection/collectionController");

const router = express.Router();

/**
 * Public storefront collection lookup.
 *
 * Deliberately NOT behind verifyToken — the storefront (Next.js) fetches this
 * server-side for anonymous visitors.
 */
router.get("/:slug", getCollectionBySlug);

module.exports = router;