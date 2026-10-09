/**
 * Admin controllers for the Static Pages CMS.
 * All routes behind verifyToken + requireAdmin.
 */

const pagesService = require("./pages.service");
const ApiResponse = require("../../../core/ApiResponse");
const asyncHandler = require("../../../core/middleware/asyncHandler");
const logger = require("../../../utils/logger");

class PagesAdminController {
  /** POST / — create a blank (draft) page */
  createPage = asyncHandler(async (req, res) => {
    const page = await pagesService.createPage(req.body, req.user?.id);
    res
      .status(201)
      .json(ApiResponse.success("Page created", page).toJSON());
  });

  /** GET / — list all pages */
  listPages = asyncHandler(async (req, res) => {
    const pages = await pagesService.listPages({
      query: req.query.query || "",
    });
    res
      .status(200)
      .json(ApiResponse.success("Pages fetched successfully", pages).toJSON());
  });

  /** GET /:id — full page (draft + published + metadata) */
  getPageById = asyncHandler(async (req, res) => {
    const page = await pagesService.getPageById(req.params.id);
    res.status(200).json(ApiResponse.success("Page fetched successfully", page).toJSON());
  });

  /** PUT /:id — save draft only (never live) */
  saveDraft = asyncHandler(async (req, res) => {
    const page = await pagesService.saveDraft(
      req.params.id,
      req.body,
      req.user?.id
    );
    res
      .status(200)
      .json(ApiResponse.success("Draft saved successfully", page).toJSON());
  });

  /** POST /:id/publish — validate draft, push to live, bump version */
  publishPage = asyncHandler(async (req, res) => {
    const page = await pagesService.publishPage(req.params.id, req.user?.id);
    res
      .status(200)
      .json(ApiResponse.success("Page published successfully", page).toJSON());
  });

  /** DELETE /:id */
  deletePage = asyncHandler(async (req, res) => {
    const result = await pagesService.deletePage(req.params.id);
    res.status(200).json(ApiResponse.success("Page deleted successfully", result).toJSON());
  });
}

module.exports = new PagesAdminController();