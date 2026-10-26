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
      .custom((value) => {
        if (["home", "about", "policies", "header", "footer"].includes(value)) return true;
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value).replace(/^landing:/, ""))) return true;
        throw new Error(
          "Invalid page. Must be one of: home, about, policies, header, footer"
        );
      }),
    body("content")
      .notEmpty()
      .withMessage("Content is required")
      .custom((value, { req }) => {
        const page = req.body.page;
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(page).replace(/^landing:/, "")) && !["home", "about", "policies", "header", "footer"].includes(page)) {
          if (!Array.isArray(value)) throw new Error("Content for landing pages must be an array of blocks");
          return true;
        }
        const isHomeOrAbout = page === "home" || page === "about";

        if (isHomeOrAbout) {
          if (!Array.isArray(value)) {
            throw new Error(
              "Content for home/about pages must be an array of blocks"
            );
          }

          value.forEach((block, index) => {
            if (!block.block_type) {
              throw new Error(
                `Block at index ${index} is missing required field 'block_type'`
              );
            }
          });
        } else {
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
      .custom((value) => {
        if (["home", "about", "policies", "header", "footer"].includes(value)) return true;
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value).replace(/^landing:/, ""))) return true;
        throw new Error(
          "Invalid page. Must be one of: home, about, policies, header, footer"
        );
      }),
    body("content")
      .notEmpty()
      .withMessage("Content is required")
      .custom((value, { req }) => {
        const page = req.params.page;
        const pageClean = String(page).replace(/^landing:/, "");
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageClean) && !["home", "about", "policies", "header", "footer"].includes(page)) {
          if (!Array.isArray(value)) throw new Error("Content for landing pages must be an array of blocks");
          return true;
        }
        const isHome = page === "home";
        const isAbout = page === "about";
        const isPolicies = page === "policies";

        if (isHome) {
          if (!Array.isArray(value)) {
            throw new Error("Content for home page must be an array of blocks");
          }

          value.forEach((block, index) => {
            if (!block.block_type) {
              throw new Error(
                `Block at index ${index} is missing required field 'block_type'`
              );
            }
          });
        } else if (isAbout) {
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
          if (typeof value !== "string") {
            throw new Error(
              "Content for policies page must be a string (HTML content)"
            );
          }
          if (value.trim() === "") {
            throw new Error("Policy content cannot be empty");
          }
        } else {
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
