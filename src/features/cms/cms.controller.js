const cmsService = require("./cms.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");
const logger = require("../../utils/logger");
const { cacheGet, cacheSet } = require("../../utils/redisCache");

/**
 * CMS Public Controller
 * Handles public CMS content access (no authentication required)
 */
class CmsController {
  /**
   * Get CMS content by page (public access)
   */
  getContentByPage = asyncHandler(async (req, res) => {
    try {
      const { page } = req.params;
      const { slug } = req.query; // Get slug from query parameter for policies

      logger.info(`📥 [CMS Public] GET /cms/${page} - getContentByPage called`);
      logger.info("📥 [CMS Public] Request params:", { page, slug });

      const cacheKey = slug ? `cms:${page}:${slug}` : `cms:${page}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return res.status(200).json(cached);

      const content = await cmsService.getContentByPage(page, slug);

      logger.info(`📤 [CMS Public] Response for page "${page}":`, {
        page: content?.page,
        title: content?.title,
        contentType: typeof content?.content,
        contentLength:
          typeof content?.content === "string"
            ? content.content.length
            : Array.isArray(content?.content)
            ? content.content.length
            : content?.content && typeof content.content === "object"
            ? Object.keys(content.content).length
            : "N/A",
        hasContent: !!content?.content,
      });

      const response = ApiResponse.success(
        "CMS content fetched successfully",
        content
      ).toJSON();

      await cacheSet(cacheKey, response);

      res.status(200).json(response);
    } catch (error) {
      logger.error(
        `❌ [CMS Public] Error fetching content for page "${req.params.page}":`,
        error
      );
      throw error; // Let asyncHandler handle it
    }
  });
}

module.exports = new CmsController();
