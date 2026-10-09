/**
 * Public controller for the Static Pages CMS (no auth).
 */

const pagesService = require("./pages.service");
const ApiResponse = require("../../../core/ApiResponse");
const asyncHandler = require("../../../core/middleware/asyncHandler");
const ApiError = require("../../../core/ApiError");

class PagesPublicController {
  /** GET /cms/pages/:slug — published content only */
  getPublishedPage = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const page = await pagesService.getPublishedBySlug(slug);
    if (!page) {
      throw ApiError.notFound(`Page "${slug}" not found or not published`);
    }

    res
      .status(200)
      .json(ApiResponse.success("Page fetched successfully", page).toJSON());
  });
}

module.exports = new PagesPublicController();