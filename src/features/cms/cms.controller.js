const cmsService = require("./cms.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

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

      console.log(`📥 [CMS Public] GET /cms/${page} - getContentByPage called`);
      console.log("📥 [CMS Public] Request params:", { page, slug });

      const content = await cmsService.getContentByPage(page, slug);

      console.log(`📤 [CMS Public] Response for page "${page}":`, {
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

      res
        .status(200)
        .json(
          ApiResponse.success(
            "CMS content fetched successfully",
            content
          ).toJSON()
        );
    } catch (error) {
      console.error(
        `❌ [CMS Public] Error fetching content for page "${req.params.page}":`,
        error
      );
      throw error; // Let asyncHandler handle it
    }
  });
}

module.exports = new CmsController();
