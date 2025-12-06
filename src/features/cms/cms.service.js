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
    // For homepage and about: fetch ALL documents (each is a block)
    // For others: fetch single document
    const [homepageData, aboutData, policyData, headerData, footerData] =
      await Promise.all([
        Homepage.find({}).sort({ createdAt: 1 }),
        About.find({}).sort({ createdAt: 1 }),
        Policy.findOne({}),
        Header.findOne({}),
        Footer.findOne({}),
      ]);

    const content = [];

    // Helper function to extract content from document(s)
    const extractContent = (docs, isMultiDocument = false) => {
      if (!docs || (Array.isArray(docs) && docs.length === 0)) return null;

      if (isMultiDocument && Array.isArray(docs)) {
        // Multiple documents - each is a block
        return docs.map((doc) => {
          const docObj = doc.toObject ? doc.toObject() : doc;
          const { _id, __v, createdAt, updatedAt, ...blockData } = docObj;
          return blockData;
        });
      } else if (!Array.isArray(docs)) {
        // Single document
        const docObject = docs.toObject ? docs.toObject() : docs;
        // If document has a 'content' field and it's an array, use that
        if (docObject.content && Array.isArray(docObject.content)) {
          return docObject.content;
        }
        // Otherwise, use the entire document (remove MongoDB fields)
        const { _id, __v, createdAt, updatedAt, ...rest } = docObject;
        return rest;
      }
      return null;
    };

    if (homepageData && homepageData.length > 0) {
      content.push({
        page: "home",
        title: "Home Page",
        content: extractContent(homepageData, true),
      });
    }
    if (aboutData && aboutData.length > 0) {
      content.push({
        page: "about",
        title: "About Us",
        content: extractContent(aboutData, true),
      });
    }
    if (policyData) {
      content.push({
        page: "policies",
        title: "Policies",
        content: extractContent(policyData, false),
      });
    }
    if (headerData) {
      content.push({
        page: "header",
        title: "Header",
        content: extractContent(headerData, false),
      });
    }
    if (footerData) {
      content.push({
        page: "footer",
        title: "Footer",
        content: extractContent(footerData, false),
      });
    }

    return content;
  }

  /**
   * Get CMS content by page
   */
  async getContentByPage(page) {
    const pageConfig = this.modelMap[page];
    if (!pageConfig) {
      throw ApiError.badRequest(
        `Invalid page. Must be one of: ${Object.keys(this.modelMap).join(", ")}`
      );
    }

    // For homepage and about pages, fetch ALL documents (each document is a block/widget)
    // For other pages (header/footer), fetch a single document
    const isMultiDocumentPage = page === "home" || page === "about";

    let content = [];

    if (isMultiDocumentPage) {
      // Fetch all documents - each document is a block/widget
      const allDocuments = await pageConfig.model
        .find({})
        .sort({ createdAt: 1 });

      if (!allDocuments || allDocuments.length === 0) {
        throw ApiError.notFound(`CMS content for page '${page}' not found`);
      }

      console.log(
        `🔍 [CMS Service] Found ${allDocuments.length} documents for page "${page}"`
      );

      // Convert each document to plain object and remove MongoDB internal fields
      content = allDocuments.map((doc) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        // Remove MongoDB internal fields but keep the block structure
        const { _id, __v, createdAt, updatedAt, ...blockData } = docObj;
        return blockData;
      });

      console.log(
        `✅ [CMS Service] Extracted ${content.length} blocks from multiple documents`
      );
      console.log(
        `📦 [CMS Service] Block types:`,
        content.map((block) => block.block_type || "unknown")
      );
    } else {
      // For header/footer: fetch single document
      const document = await pageConfig.model.findOne({});

      if (!document) {
        throw ApiError.notFound(`CMS content for page '${page}' not found`);
      }

      // Convert Mongoose document to plain object
      const docObject = document.toObject ? document.toObject() : document;

      console.log(`🔍 [CMS Service] Raw document for page "${page}":`, {
        hasContent: !!docObject.content,
        contentType: typeof docObject.content,
        isArray: Array.isArray(docObject.content),
        keys: Object.keys(docObject).slice(0, 10),
      });

      // For header/footer, the document IS the content (or has a content field)
      if (docObject.content && Array.isArray(docObject.content)) {
        content = docObject.content;
      } else {
        // Remove MongoDB internal fields
        const { _id, __v, createdAt, updatedAt, ...rest } = docObject;
        content = rest;
      }

      console.log(`✅ [CMS Service] Extracted content for page "${page}"`);
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

    const isHomeOrAbout = page === "home" || page === "about";
    let updated;

    if (isHomeOrAbout && Array.isArray(contentData)) {
      // For homepage/about: contentData is an array of blocks
      // Each block should be saved as a separate document
      // First, delete all existing documents
      await pageConfig.model.deleteMany({});

      // Then create new documents for each block
      const createdDocs = await pageConfig.model.insertMany(contentData);

      // Convert to plain objects and remove MongoDB fields
      updated = createdDocs.map((doc) => {
        const docObj = doc.toObject ? doc.toObject() : doc;
        const { _id, __v, createdAt, updatedAt, ...blockData } = docObj;
        return blockData;
      });

      console.log(
        `✅ [CMS Service] Updated ${page} with ${updated.length} blocks`
      );
    } else {
      // For header/footer/policies: contentData is a single object
      const existing = await pageConfig.model.findOne({});

      if (existing) {
        // Merge with existing data
        const existingObj = existing.toObject ? existing.toObject() : existing;
        const merged = { ...existingObj, ...contentData };
        const updatedDoc = await pageConfig.model.findOneAndUpdate({}, merged, {
          new: true,
        });

        // Extract content for response
        const docObject = updatedDoc.toObject
          ? updatedDoc.toObject()
          : updatedDoc;
        if (docObject.content && Array.isArray(docObject.content)) {
          updated = docObject.content;
        } else {
          const { _id, __v, createdAt, updatedAt, ...rest } = docObject;
          updated = rest;
        }
      } else {
        // Create new
        const createdDoc = await pageConfig.model.create(contentData);
        const docObject = createdDoc.toObject
          ? createdDoc.toObject()
          : createdDoc;
        if (docObject.content && Array.isArray(docObject.content)) {
          updated = docObject.content;
        } else {
          const { _id, __v, createdAt, updatedAt, ...rest } = docObject;
          updated = rest;
        }
      }
    }

    return {
      page,
      title: pageConfig.title,
      content: updated,
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
