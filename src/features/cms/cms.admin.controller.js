const cmsService = require("./cms.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

/**
 * CMS Admin Controller
 * Handles CMS admin operations
 */
class CmsAdminController {
  /**
   * Get all CMS content
   */
  getAllContent = asyncHandler(async (req, res) => {
    console.log("📥 [CMS] GET /admin/cms - getAllContent called");
    console.log("📥 [CMS] Request headers:", {
      authorization: req.headers.authorization ? "Bearer ***" : "none",
      origin: req.headers.origin,
    });

    const content = await cmsService.getAllContent();

    console.log("📤 [CMS] Response data:", {
      contentLength: Array.isArray(content) ? content.length : "not array",
      pages: Array.isArray(content) ? content.map((c) => c.page) : "N/A",
      firstPageContent:
        Array.isArray(content) && content[0]
          ? {
              page: content[0].page,
              title: content[0].title,
              contentType: Array.isArray(content[0].content)
                ? `array[${content[0].content.length}]`
                : typeof content[0].content,
            }
          : "N/A",
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          "CMS content fetched successfully",
          content
        ).toJSON()
      );
  });

  /**
   * Get CMS content by page
   */
  getContentByPage = asyncHandler(async (req, res) => {
    const { page } = req.params;
    console.log(`📥 [CMS] GET /admin/cms/${page} - getContentByPage called`);
    console.log("📥 [CMS] Request params:", { page });
    console.log("📥 [CMS] Request headers:", {
      authorization: req.headers.authorization ? "Bearer ***" : "none",
      origin: req.headers.origin,
    });

    const content = await cmsService.getContentByPage(page);

    console.log(`📤 [CMS] Response for page "${page}":`, {
      page: content.page,
      title: content.title,
      contentType: Array.isArray(content.content)
        ? `array[${content.content.length}]`
        : typeof content.content,
      contentLength: Array.isArray(content.content)
        ? content.content.length
        : "N/A",
      allBlockTypes: Array.isArray(content.content)
        ? content.content.map((b) => b.block_type || "unknown")
        : "N/A",
      firstBlock:
        Array.isArray(content.content) && content.content[0]
          ? {
              block_type: content.content[0].block_type,
              enabled: content.content[0].enabled,
              hasContent: !!content.content[0].content,
            }
          : "N/A",
    });

    // Ensure content is in correct format for each page type
    if (page === "policies") {
      // Policies should be a string
      if (typeof content.content !== "string") {
        console.warn(
          `⚠️ [CMS] Content for ${page} is not a string, converting...`
        );
        // If it's an array (legacy), convert to HTML string
        if (Array.isArray(content.content)) {
          content.content = content.content
            .map((block) => {
              if (block && block.html) {
                return `<section id="${block.slug || "policy"}">\n<h1>${block.title || "Policy"}</h1>\n${block.html}\n</section>`;
              }
              return "";
            })
            .filter(Boolean)
            .join("\n\n");
        } else {
          content.content = "";
        }
      }
    } else if (page === "home" || page === "about") {
      // Home/About should be an array
      if (!Array.isArray(content.content)) {
        console.warn(
          `⚠️ [CMS] Content for ${page} is not an array, converting...`
        );
        content.content = content.content ? [content.content] : [];
      }
    }

    res
      .status(200)
      .json(
        ApiResponse.success(
          "CMS content fetched successfully",
          content
        ).toJSON()
      );
  });

  /**
   * Update CMS content
   */
  updateContent = asyncHandler(async (req, res) => {
    const { page, content } = req.body;

    console.log(`📥 [CMS] POST /admin/cms - updateContent called`);
    console.log("📥 [CMS] Request body:", {
      page,
      hasContent: !!content,
      contentType: Array.isArray(content)
        ? `array[${content.length}]`
        : typeof content,
      contentPreview: Array.isArray(content)
        ? content.slice(0, 2).map((b) => ({
            block_type: b.block_type,
            enabled: b.enabled,
            order: b.order,
            hasData: !!b.data || Object.keys(b).length > 3,
          }))
        : "not array",
    });

    // Validation
    if (!page) {
      return res
        .status(400)
        .json(ApiResponse.error("Page parameter is required", 400).toJSON());
    }

    if (content === undefined || content === null) {
      return res
        .status(400)
        .json(ApiResponse.error("Content is required", 400).toJSON());
    }

    const updated = await cmsService.updateContent(page, content);

    console.log(`📤 [CMS] Update successful for page "${page}":`, {
      page: updated.page,
      title: updated.title,
      contentLength: Array.isArray(updated.content)
        ? updated.content.length
        : "not array",
      blockTypes: Array.isArray(updated.content)
        ? updated.content.map((b) => b.block_type || "unknown")
        : "N/A",
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          "CMS content updated successfully",
          updated
        ).toJSON()
      );
  });

  /**
   * Update CMS content by page (PUT /admin/cms/:page)
   */
  updateContentByPage = asyncHandler(async (req, res) => {
    const { page } = req.params;
    const { content } = req.body;

    console.log(`📥 [CMS] PUT /admin/cms/${page} - updateContentByPage called`);
    console.log("📥 [CMS] Request body:", {
      page,
      hasContent: !!content,
      contentType: Array.isArray(content)
        ? `array[${content.length}]`
        : typeof content,
    });

    // Validation
    if (!content || content === null) {
      return res
        .status(400)
        .json(ApiResponse.error("Content is required", 400).toJSON());
    }

    const updated = await cmsService.updateContent(page, content);

    console.log(`📤 [CMS] Update successful for page "${page}":`, {
      page: updated.page,
      title: updated.title,
      contentLength: Array.isArray(updated.content)
        ? updated.content.length
        : "not array",
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          "CMS content updated successfully",
          updated
        ).toJSON()
      );
  });

  /**
   * Delete CMS content
   */
  deleteContent = asyncHandler(async (req, res) => {
    const { page } = req.params;
    await cmsService.deleteContent(page);

    res
      .status(200)
      .json(ApiResponse.success("CMS content deleted successfully").toJSON());
  });
}

module.exports = new CmsAdminController();
