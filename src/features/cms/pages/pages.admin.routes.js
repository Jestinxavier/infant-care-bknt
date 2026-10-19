/**
 * Admin API routes for the Static Pages CMS.
 * Mounted at /api/v1<ADMIN_PREFIX>/pages in app.js.
 */

const express = require("express");
const router = express.Router();
const pagesAdminController = require("./pages.admin.controller");
const verifyToken = require("../../../middlewares/authMiddleware");
const requireAdmin = require("../../../middlewares/adminMiddleware");
const { validate } = require("../../../core/middleware/validator");
const {
  validateCreatePage,
  validateUpdatePage,
  validatePublishPage,
  validatePageId,
  validateListQuery,
} = require("./pages.validation");

/**
 * @swagger
 * tags:
 *   name: Admin Static Pages
 *   description: "[Admin] Unified CMS pages with draft/publish workflow"
 */

router.use(verifyToken);
router.use(requireAdmin);

router.get("/", validate(validateListQuery), pagesAdminController.listPages);

router.post("/", validate(validateCreatePage), pagesAdminController.createPage);

router.get("/:id", validate(validatePageId), pagesAdminController.getPageById);

router.put(
  "/:id",
  validate(validateUpdatePage),
  pagesAdminController.saveDraft
);

router.post(
  "/:id/publish",
  validate(validatePublishPage),
  pagesAdminController.publishPage
);

router.delete("/:id", validate(validatePageId), pagesAdminController.deletePage);

module.exports = router;