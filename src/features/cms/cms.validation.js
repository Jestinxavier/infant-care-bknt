const { body, param } = require("express-validator");

/**
 * CMS Validation Rules
 */
const cmsValidation = {
  /**
   * Validate page parameter
   */
  validatePage: param("page")
    .isIn(["home", "about", "policies", "header", "footer"])
    .withMessage(
      "Invalid page. Must be one of: home, about, policies, header, footer"
    ),

  /**
   * Validate update content request
   */
  validateUpdateContent: [
    body("page")
      .notEmpty()
      .withMessage("Page is required")
      .isIn(["home", "about", "policies", "header", "footer"])
      .withMessage(
        "Invalid page. Must be one of: home, about, policies, header, footer"
      ),
    body("content")
      .notEmpty()
      .withMessage("Content is required")
      .custom((value, { req }) => {
        const page = req.body.page;
        const isHomeOrAbout = page === "home" || page === "about";

        if (isHomeOrAbout) {
          // For home/about pages, content must be an array
          if (!Array.isArray(value)) {
            throw new Error(
              "Content for home/about pages must be an array of blocks"
            );
          }

          // Validate each block
          value.forEach((block, index) => {
            if (!block.block_type) {
              throw new Error(
                `Block at index ${index} is missing required field 'block_type'`
              );
            }
          });
        } else {
          // For other pages, content should be an object
          if (Array.isArray(value)) {
            throw new Error(
              "Content for header/footer/policies pages must be an object, not an array"
            );
          }
          if (typeof value !== "object" || value === null) {
            throw new Error("Content must be an object");
          }
        }

        return true;
      }),
  ],

  /**
   * Validate update content by page (PUT /:page)
   */
  validateUpdateContentByPage: [
    param("page")
      .isIn(["home", "about", "policies", "header", "footer"])
      .withMessage(
        "Invalid page. Must be one of: home, about, policies, header, footer"
      ),
    body("content")
      .notEmpty()
      .withMessage("Content is required")
      .custom((value, { req }) => {
        const page = req.params.page;
        const isHome = page === "home";
        const isAbout = page === "about";
        const isPolicies = page === "policies";

        if (isHome) {
          // For home page, content must be an array
          if (!Array.isArray(value)) {
            throw new Error("Content for home page must be an array of blocks");
          }

          // Validate each block
          value.forEach((block, index) => {
            if (!block.block_type) {
              throw new Error(
                `Block at index ${index} is missing required field 'block_type'`
              );
            }
          });
        } else if (isAbout) {
          // For about page, content must be an array of blocks (same as home)
          if (!Array.isArray(value)) {
            throw new Error(
              "Content for about page must be an array of blocks"
            );
          }

          value.forEach((block, index) => {
            if (!block.block_type) {
              throw new Error(
                `Block at index ${index} is missing required field 'block_type'`
              );
            }
          });
        } else if (isPolicies) {
          // For policies page, content must be a string (single HTML content)
          if (typeof value !== "string") {
            throw new Error(
              "Content for policies page must be a string (HTML content)"
            );
          }
          if (value.trim() === "") {
            throw new Error("Policy content cannot be empty");
          }
        } else {
          // For header/footer pages, content should be an object
          if (Array.isArray(value)) {
            throw new Error(
              "Content for header/footer pages must be an object, not an array"
            );
          }
          if (typeof value !== "object" || value === null) {
            throw new Error("Content must be an object");
          }
        }

        return true;
      }),
  ],
};

module.exports = cmsValidation;
