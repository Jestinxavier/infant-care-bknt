const Homepage = require("../../models/Homepage");
const About = require("../../models/About");
const Policy = require("../../models/Policy");
const Header = require("../../models/Header");
const Footer = require("../../models/Footer");
const ApiError = require("../../core/ApiError");

/**
 * CMS Service
 * Handles all CMS business logic
 * Fully isolated from ecommerce logic
 */
class CmsService {
  // Model mapping
  modelMap = {
    home: { model: Homepage, title: "Home Page" },
    about: { model: About, title: "About Us" },
    policies: { model: Policy, title: "Policies" },
    header: { model: Header, title: "Header" },
    footer: { model: Footer, title: "Footer" },
  };

  /**
   * Get all CMS content
   */
  async getAllContent() {
    const [homepageData, aboutData, policyData, headerData, footerData] =
      await Promise.all([
        Homepage.findOne({}),
        About.findOne({}),
        Policy.findOne({}),
        Header.findOne({}),
        Footer.findOne({}),
      ]);

    const content = [];

    // Helper function to extract content from document
    const extractContent = (doc) => {
      if (!doc) return null;
      const docObject = doc.toObject ? doc.toObject() : doc;
      // If document has a 'content' field and it's an array, use that
      if (docObject.content && Array.isArray(docObject.content)) {
        return docObject.content;
      }
      // Otherwise, use the entire document
      return docObject;
    };

    if (homepageData) {
      content.push({
        page: "home",
        title: "Home Page",
        content: extractContent(homepageData),
      });
    }
    if (aboutData) {
      content.push({
        page: "about",
        title: "About Us",
        content: extractContent(aboutData),
      });
    }
    if (policyData) {
      content.push({
        page: "policies",
        title: "Policies",
        content: extractContent(policyData),
      });
    }
    if (headerData) {
      content.push({
        page: "header",
        title: "Header",
        content: extractContent(headerData),
      });
    }
    if (footerData) {
      content.push({
        page: "footer",
        title: "Footer",
        content: extractContent(footerData),
      });
    }

    return content;
  }

  /**
   * Get CMS content by page (and optionally by slug for policies)
   * @param {string} page - The page identifier (home, about, policies, header, footer)
   * @param {string} [slug] - Optional slug for filtering policies (privacy, terms, shipping, returns)
   */
  async getContentByPage(page, slug = null) {
    const pageConfig = this.modelMap[page];
    if (!pageConfig) {
      throw ApiError.badRequest(
        `Invalid page. Must be one of: ${Object.keys(this.modelMap).join(", ")}`
      );
    }

    // For homepage, always fetch all documents (widgets are stored as separate documents)
    // Similar to how /api/v1/homepage endpoint works
    if (page === "home") {
      const allDocuments = await pageConfig.model.find({});
      console.log(
        `✅ [CMS Service] Homepage: Found ${allDocuments.length} widget documents`
      );

      if (allDocuments.length === 0) {
        return {
          page,
          title: pageConfig.title,
          content: [],
        };
      }

      // Convert all documents to plain objects and remove MongoDB internal fields
      const content = allDocuments.map((doc) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        const { _id, __v, createdAt, updatedAt, ...rest } = docObj;
        return rest;
      });

      return {
        page,
        title: pageConfig.title,
        content,
      };
    }

    // For other pages, try to find a single document first (most common case)
    let document = await pageConfig.model.findOne({});

    // If no document found, try to find all documents (in case blocks are separate documents)
    let allDocuments = [];
    if (!document) {
      allDocuments = await pageConfig.model.find({});
      console.log(
        `🔍 [CMS Service] No single document found, found ${allDocuments.length} documents`
      );
    }

    // If no content exists, return empty structure instead of throwing error
    // This allows the frontend to work with empty pages and create new content
    if (!document && allDocuments.length === 0) {
      console.log(
        `⚠️ [CMS Service] No content found for page '${page}', returning empty structure`
      );

      // Return appropriate empty structure based on page type
      // For pages with blocks (home, about), return empty array
      // For policies, return empty string
      // For header/footer, return appropriate empty structure
      const isBlockBasedPage = page === "home" || page === "about";
      const isPoliciesPage = page === "policies";
      let emptyContent;
      if (isBlockBasedPage) {
        emptyContent = [];
      } else if (isPoliciesPage) {
        emptyContent = "";
      } else {
        emptyContent = {};
      }

      return {
        page,
        title: pageConfig.title,
        content: emptyContent,
      };
    }

    // Convert Mongoose document to plain object
    const docObject = document
      ? document.toObject
        ? document.toObject()
        : document
      : null;

    console.log(`🔍 [CMS Service] Raw document for page "${page}":`, {
      hasDocument: !!document,
      documentCount: allDocuments.length,
      hasContent: docObject ? !!docObject.content : false,
      contentType: docObject ? typeof docObject.content : "N/A",
      isArray: docObject ? Array.isArray(docObject.content) : false,
      contentLength:
        docObject && Array.isArray(docObject.content)
          ? docObject.content.length
          : "N/A",
      keys: docObject ? Object.keys(docObject).slice(0, 10) : [],
    });

    // Extract content field if it exists, otherwise use the entire document
    // For homepage/about: document has { content: [...blocks] }
    // For policies: document has { content: "html string" }
    // For header/footer: document IS the content
    let content = docObject;

    // Case 1: Policies page - content is a string
    if (page === "policies" && docObject && docObject.content) {
      if (typeof docObject.content === "string") {
        content = docObject.content;
        console.log(
          `✅ [CMS Service] Extracted policy content (string, length: ${content.length})`
        );

        // If slug is provided, try to extract that section from HTML using regex
        if (slug && typeof content === "string") {
          const sectionMatch = content.match(
            new RegExp(
              `<section[^>]*id=["']${slug}["'][^>]*>([\\s\\S]*?)<\\/section>`,
              "i"
            )
          );
          if (sectionMatch) {
            content = sectionMatch[0];
            console.log(
              `🔍 [CMS Service] Extracted policy section with slug '${slug}'`
            );
          } else {
            console.log(
              `⚠️ [CMS Service] No section found with slug '${slug}', returning full content`
            );
          }
        }
      } else if (Array.isArray(docObject.content)) {
        // Legacy format: convert array to HTML string
        console.log(
          `⚠️ [CMS Service] Converting legacy array format to HTML string`
        );
        const policyBlocks = docObject.content;
        content = policyBlocks
          .map((block) => {
            if (block && block.html) {
              return `<section id="${block.slug || "policy"}">\n<h1>${
                block.title || "Policy"
              }</h1>\n${block.html}\n</section>`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n\n");
      }
    }
    // Case 2: Single document with content array (homepage/about)
    else if (
      docObject &&
      docObject.content &&
      Array.isArray(docObject.content)
    ) {
      content = docObject.content;
      console.log(
        `✅ [CMS Service] Extracted content array with ${content.length} blocks`
      );

      // Log first few blocks for debugging
      if (content.length > 0) {
        console.log(
          `📦 [CMS Service] First 3 blocks:`,
          content.slice(0, 3).map((block) => ({
            block_type: block.block_type,
            enabled: block.enabled,
            hasContent: !!block.content,
          }))
        );
      }
    }
    // Case 2.5: Footer/Header pages with content object
    else if (
      (page === "footer" || page === "header") &&
      docObject &&
      docObject.content &&
      typeof docObject.content === "object" &&
      !Array.isArray(docObject.content)
    ) {
      // For footer/header, extract the content object
      content = docObject.content;
      console.log(`✅ [CMS Service] Extracted ${page} content object`);
    }
    // Case 3: Multiple documents where each document is a block (legacy structure)
    else if (allDocuments.length > 0) {
      content = allDocuments.map((doc) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        // Remove MongoDB internal fields
        delete docObj._id;
        delete docObj.__v;
        delete docObj.createdAt;
        delete docObj.updatedAt;
        return docObj;
      });
      console.log(
        `✅ [CMS Service] Extracted ${content.length} blocks from multiple documents`
      );
    }
    // Case 4: Single document without content field (use entire document)
    else if (docObject) {
      // Remove MongoDB internal fields
      const { _id, __v, createdAt, updatedAt, ...rest } = docObject;
      content = rest;
      console.log(`⚠️ [CMS Service] Using entire document as content`);
    }
    // Case 5: For header/footer, document IS the content
    else {
      console.log(`⚠️ [CMS Service] No content found, using empty array`);
      content = [];
    }

    return {
      page,
      title: pageConfig.title,
      content,
    };
  }

  /**
   * Update CMS content
   */
  async updateContent(page, contentData) {
    const pageConfig = this.modelMap[page];
    if (!pageConfig) {
      throw ApiError.badRequest(
        `Invalid page. Must be one of: ${Object.keys(this.modelMap).join(", ")}`
      );
    }

    const existing = await pageConfig.model.findOne({});
    let updated;

    // For homepage/about: contentData is an array of blocks, need to wrap in { content: [...] }
    // For policies: contentData is a string (HTML), need to wrap in { content: string }
    // For header/footer: contentData is the object itself
    const isBlockBasedPage = page === "home" || page === "about";
    const isPoliciesPage = page === "policies";
    const isFooterOrHeaderPage = page === "footer" || page === "header";

    let updateData;
    if (isBlockBasedPage && Array.isArray(contentData)) {
      updateData = { content: contentData };
    } else if (isPoliciesPage && typeof contentData === "string") {
      // Store policies as single HTML string
      updateData = { content: contentData };
    } else if (
      isFooterOrHeaderPage &&
      typeof contentData === "object" &&
      contentData !== null
    ) {
      // For footer/header, wrap the contentData in a content field
      updateData = { content: contentData };
    } else {
      updateData = contentData;
    }

    if (existing) {
      // Merge with existing data
      const existingObj = existing.toObject ? existing.toObject() : existing;
      const merged = { ...existingObj, ...updateData };
      updated = await pageConfig.model.findOneAndUpdate({}, merged, {
        new: true,
      });
    } else {
      // Create new
      updated = await pageConfig.model.create(updateData);
    }

    // Extract content for response (same logic as getContentByPage)
    const docObject = updated.toObject ? updated.toObject() : updated;
    let content = docObject;

    // For policies, content is a string
    if (page === "policies" && docObject.content) {
      content = docObject.content; // Already a string from updateData
    }
    // For footer/header, content is an object
    else if (
      (page === "footer" || page === "header") &&
      docObject.content &&
      typeof docObject.content === "object" &&
      !Array.isArray(docObject.content)
    ) {
      content = docObject.content; // Extract the content object
    }
    // For home/about, content is an array
    else if (docObject.content && Array.isArray(docObject.content)) {
      content = docObject.content;
    }

    return {
      page,
      title: pageConfig.title,
      content,
    };
  }

  /**
   * Delete CMS content
   */
  async deleteContent(page) {
    const pageConfig = this.modelMap[page];
    if (!pageConfig) {
      throw ApiError.badRequest(
        `Invalid page. Must be one of: ${Object.keys(this.modelMap).join(", ")}`
      );
    }

    const deleted = await pageConfig.model.findOneAndDelete({});
    if (!deleted) {
      throw ApiError.notFound(`CMS content for page '${page}' not found`);
    }

    return { success: true };
  }
}

module.exports = new CmsService();
