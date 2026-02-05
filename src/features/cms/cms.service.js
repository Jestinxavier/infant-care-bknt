const Homepage = require("../../models/Homepage");
const About = require("../../models/About");
const Policy = require("../../models/Policy");
const Header = require("../../models/Header");
const Footer = require("../../models/Footer");
const ApiError = require("../../core/ApiError");
const mongoose = require("mongoose");
const menuValidator = require("./menu.validation");
const { ensureContentImageUrls } = require("../../utils/cloudinaryUrlUtils");

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
        content: ensureContentImageUrls(extractContent(homepageData)),
      });
    }
    if (aboutData) {
      content.push({
        page: "about",
        title: "About Us",
        content: ensureContentImageUrls(extractContent(aboutData)),
      });
    }
    if (policyData) {
      content.push({
        page: "policies",
        title: "Policies",
        content: ensureContentImageUrls(extractContent(policyData)),
      });
    }
    if (headerData) {
      content.push({
        page: "header",
        title: "Header",
        content: ensureContentImageUrls(extractContent(headerData)),
      });
    }
    if (footerData) {
      content.push({
        page: "footer",
        title: "Footer",
        content: ensureContentImageUrls(extractContent(footerData)),
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

    // For homepage and about page, always fetch all documents (widgets are stored as separate documents)
    // Similar to how /api/v1/homepage endpoint works
    if (page === "home" || page === "about") {
      const allDocuments = await pageConfig.model.find({}).sort({ order: 1 });
      console.log(
        `✅ [CMS Service] ${page}: Found ${allDocuments.length} widget documents`
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
        // Ensure ID is passed for frontend matching
        return { ...rest, id: _id.toString() };
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

    // Case 1: Policies page
    if (page === "policies") {
      // If slug is provided, find specific policy document
      if (slug) {
        const policyDoc = await pageConfig.model.findOne({ slug });
        if (!policyDoc) {
          // Fallback or empty struct?
          console.log(`⚠️ [CMS Service] Policy with slug '${slug}' not found`);
          return {
            page,
            title: pageConfig.title,
            content: "", // Return empty content for 404/new policy
            slug,
          };
        }
        return {
          page,
          title: policyDoc.title || pageConfig.title,
          content: policyDoc.content || "",
          slug,
        };
      } else {
        // Return ALL policy documents
        const allPolicies = await pageConfig.model.find({});
        console.log(
          `✅ [CMS Service] Found ${allPolicies.length} policy documents`
        );

        // Return as an array of { slug, title, content }
        const content = allPolicies.map((p) => ({
          slug: p.slug,
          title: p.title,
          content: p.content,
        }));

        return {
          page,
          title: pageConfig.title,
          content,
        };
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
      content: ensureContentImageUrls(content),
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

    // For policies: contentData is a string (HTML)
    // For header/footer: contentData is the object itself
    // For home/about: contentData is an array of blocks (documents)
    const isBlockBasedPage = page === "home" || page === "about";
    const isPoliciesPage = page === "policies";
    const isFooterOrHeaderPage = page === "footer" || page === "header";

    let updatedContent;

    if (isBlockBasedPage && Array.isArray(contentData)) {
      // For home/about, we perform a smart update to preserve documents where possible
      // This avoids ID churn and cleaner handling of existing data structure issues

      console.log(
        `[CMS Service] Synchronizing content for page '${page}' with ${contentData.length} blocks`
      );

      // 1. Fetch all existing documents
      const existingDocs = await pageConfig.model.find({});
      const existingDocsMap = new Map(
        existingDocs.map((d) => [d._id.toString(), d])
      );
      const processedIds = new Set();

      // 2. Iterate through new blocks and update/create
      for (let i = 0; i < contentData.length; i++) {
        const block = contentData[i];
        const order = i;

        // Prepare block data
        // If the block has an ID that looks like a MongoID, try to use it
        // Otherwise, it's a temp ID or we rely on block_type matching
        let match = null;

        // Strategy 1: Match by valid MongoDB _id
        if (block.id && mongoose.isValidObjectId(block.id)) {
          // Verify this ID hasn't been processed yet to prevent duplicate/collision
          if (!processedIds.has(block.id)) {
            match = existingDocsMap.get(block.id);
          } else {
            console.warn(
              `[CMS Service] ID collision or duplicate detected for ${block.id}. Treating as new/separate item.`
            );
          }
        }

        // Strategy 2: Match by block_type (fallback) if we haven't used this doc yet
        // This is crucial for initial sync or if IDs are temp strings (e.g. "block-0-...")
        // Also safeguard: if block_type is missing, try to use component (legacy support for Our Story)
        const targetBlockType = block.block_type || block.component;

        if (!match && targetBlockType) {
          match = existingDocs.find(
            (d) =>
              (d.block_type === targetBlockType ||
                d.component === targetBlockType) &&
              !processedIds.has(d._id.toString())
          );
        }

        const blockPayload = {
          ...block,
          block_type: targetBlockType, // Ensure block_type is set
          order,
          // Ensure we don't accidentally save the frontend 'id' as '_id' if it's not a MongoID
          // But we DO want to strip 'id' from payload if we are saving to Mongo to avoid confusion
        };
        delete blockPayload.id; // Let Mongo handle _id or use existing match._id

        if (match) {
          // Update existing document
          // This fixes nested structures by overwriting 'content' with new flat data
          await pageConfig.model.findByIdAndUpdate(match._id, blockPayload, {
            new: true,
          });
          processedIds.add(match._id.toString());
        } else {
          // Create new document
          const newDoc = await pageConfig.model.create(blockPayload);
          processedIds.add(newDoc._id.toString());
        }
      }

      // 3. Delete any documents that were not part of the new list
      const idsToDelete = existingDocs
        .filter((d) => !processedIds.has(d._id.toString()))
        .map((d) => d._id);

      if (idsToDelete.length > 0) {
        console.log(
          `[CMS Service] Deleting ${idsToDelete.length} removed blocks`
        );
        await pageConfig.model.deleteMany({ _id: { $in: idsToDelete } });
      }

      // 4. Fetch the fresh documents to return
      const newDocs = await pageConfig.model.find({}).sort({ order: 1 });
      updatedContent = newDocs.map((doc) => {
        const d = doc.toObject ? doc.toObject() : doc;
        const { __v, createdAt, updatedAt, ...rest } = d;
        return rest;
      });
    } else {
      // Legacy/Single-Doc logic for Header, Footer
      // AND new Multi-Doc logic for Policies if slug is provided in contentData?
      // Wait, contentData structure depends on what frontend sends.
      // If frontend sends { slug: '...', content: '...' }, we use that.

      let updateData = contentData;
      let filter = {};

      if (page === "policies") {
        // Policies expect an object with { slug, content, title? }
        // If contentData is just string, it's legacy single-doc update (not supported in new mode?)
        // Let's assume contentData IS the object with slug.

        if (typeof contentData === "object" && contentData.slug) {
          filter = { slug: contentData.slug };
          // Use updateData as is (it has content and title)
          // Default title if missing?
          if (!updateData.title) {
            // Try to map slug to title
            const slugToTitle = {
              "privacy-policy": "Privacy Policy",
              "terms-and-conditions": "Terms & Conditions",
              "shipping-policy": "Shipping Policy",
              "returns-and-refunds": "Returns & Refunds",
            };
            updateData.title = slugToTitle[contentData.slug] || "Policy";
          }
        } else {
          throw new Error("Invalid policy update data. Slug is required.");
        }

        // Use findOneAndUpdate with upsert
        const result = await pageConfig.model.findOneAndUpdate(
          filter,
          updateData,
          { new: true, upsert: true }
        );
        updatedContent = result.content; // Return just the content string as per legacy expectation? Or object?
        // Frontend expects consistent return. Let's return the content string for now as it maps to the editor state.
      } else {
        // Header/Footer (Single Doc)
        const existing = await pageConfig.model.findOne({});

        if (
          isFooterOrHeaderPage &&
          typeof contentData === "object" &&
          contentData !== null
        ) {
          // Special validation for header navigation menu
          if (
            page === "header" &&
            contentData.navigation &&
            contentData.navigation.menu
          ) {
            console.log(
              "[CMS Service] Validating header navigation menu structure"
            );
            const validationResult = menuValidator.validateMenu(
              contentData.navigation.menu
            );

            if (!validationResult.valid) {
              console.error(
                "[CMS Service] Menu validation failed:",
                validationResult.errors
              );
              throw ApiError.badRequest(
                `Menu validation failed: ${validationResult.errors.join("; ")}`
              );
            }

            console.log("[CMS Service] Menu validation passed successfully");
          }

          updateData = { content: contentData };
        } else {
          updateData = contentData;
        }

        let result;
        if (existing) {
          const existingObj = existing.toObject
            ? existing.toObject()
            : existing;
          const merged = { ...existingObj, ...updateData };
          result = await pageConfig.model.findOneAndUpdate({}, merged, {
            new: true,
          });
        } else {
          result = await pageConfig.model.create(updateData);
        }

        const docObject = result.toObject ? result.toObject() : result;

        // Extract content for response
        if ((page === "footer" || page === "header") && docObject.content) {
          updatedContent = docObject.content;
        } else {
          updatedContent = docObject;
        }
      }
    }

    return {
      page,
      title: pageConfig.title,
      content: updatedContent,
    };
  }

  /**
   * Update a single block within a page's content
   * Only updates the block matching blockType, leaves others unchanged
   * @param {string} page - The page identifier
   * @param {string} blockType - The block_type to update
   * @param {object} blockData - The new data for this block
  /**
   * Update a single block within a page's content (PATCH operation)
   * Uses FLAT structure: block_type, enabled, order at document root
   * Content array contains direct items with cleaned image data
   */
  async updateSingleBlock(page, blockType, blockData) {
    const pageConfig = this.modelMap[page];
    if (!pageConfig) {
      throw ApiError.badRequest(
        `Invalid page. Must be one of: ${Object.keys(this.modelMap).join(", ")}`
      );
    }

    // Only block-based pages support single block updates
    if (page !== "home" && page !== "about") {
      throw ApiError.badRequest(
        `Single block updates are only supported for 'home' and 'about' pages`
      );
    }

    console.log(
      `[CMS Service] Updating block '${blockType}' for page '${page}'`
    );
    console.log(
      `[CMS Service] Incoming blockData:`,
      JSON.stringify(blockData, null, 2)
    );

    // Helper function to clean image metadata - keep url and alt (from Cloudinary original filename)
    const cleanImageData = (img) => {
      if (!img || !img.url) return null;
      return {
        url: img.url,
        alt: img.alt || "", // alt comes from Cloudinary's original filename
      };
    };

    // Helper function to transform banners array to flat content items
    const transformBannersToContent = (banners) => {
      if (!banners || !Array.isArray(banners)) return [];

      return banners
        .map((banner, index) => {
          // Skip completely empty banners (no images and no link)
          if (!banner.image_small && !banner.image_large && !banner.link) {
            return null;
          }

          const contentItem = {
            order: index,
          };

          // Add cleaned image data (includes alt from Cloudinary)
          if (banner.image_small) {
            contentItem.image_small = cleanImageData(banner.image_small);
          }
          if (banner.image_large) {
            contentItem.image_large = cleanImageData(banner.image_large);
          }

          // Add only link (no banner-level alt - alt is inside image objects)
          if (banner.link !== undefined) contentItem.link = banner.link;

          // Add display type for strip/full banner optimization
          if (banner.displayType !== undefined) {
            contentItem.displayType = banner.displayType;
          }

          return contentItem;
        })
        .filter(Boolean); // Remove null entries
    };

    // Transform incoming data based on block type
    let transformedContent = [];

    // Check if content is sent directly (new format from frontend)
    if (blockData.content && Array.isArray(blockData.content)) {
      // Frontend sends { content: [...] } - use it directly
      transformedContent = blockData.content;
      console.log(
        `[CMS Service] Using direct content array with ${transformedContent.length} items`
      );
    } else if (blockData.banners) {
      // For banner-based blocks (heroBanner, promoBanner, banner_grid)
      transformedContent = transformBannersToContent(blockData.banners);
    } else if (blockData.categories) {
      // For categories block - store category data directly
      transformedContent = blockData.categories.map((cat, index) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image || null,
        order: index,
      }));
    } else if (blockData.items) {
      // For product listing blocks (newArrivals, topSellers)
      transformedContent = blockData.items;
    } else if (blockData.reviews) {
      // For reviews block
      transformedContent = blockData.reviews;
    }

    // Find existing document for this block type
    let existing = await pageConfig.model.findOne({ block_type: blockType });

    // Build the flat document structure
    const flatDocument = {
      block_type: blockType,
      enabled: blockData.enabled !== undefined ? blockData.enabled : true,
      order: blockData.order !== undefined ? blockData.order : 0,
      content: transformedContent,
    };

    // Add optional widget metadata
    if (blockData.title !== undefined) {
      flatDocument.title = blockData.title;
    }
    if (blockData.link !== undefined) {
      flatDocument.link = blockData.link;
    }
    if (blockData.categorySlug !== undefined) {
      flatDocument.categorySlug = blockData.categorySlug;
    }

    console.log(
      `[CMS Service] Transformed flat document:`,
      JSON.stringify(flatDocument, null, 2)
    );

    let result;
    if (!existing) {
      // Create new document with flat structure
      console.log(
        `[CMS Service] Creating new document for block '${blockType}'`
      );
      result = await pageConfig.model.create(flatDocument);
    } else {
      // Update existing document with flat structure
      console.log(
        `[CMS Service] Updating existing document for block '${blockType}'`
      );
      result = await pageConfig.model.findOneAndUpdate(
        { block_type: blockType },
        { $set: flatDocument },
        { new: true }
      );
    }

    const resultObj = result.toObject ? result.toObject() : result;

    console.log(
      `✅ [CMS Service] Successfully saved block '${blockType}' with flat structure`
    );

    return {
      page,
      title: pageConfig.title,
      block: resultObj,
      blockType,
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
