const Homepage = require("../../models/Homepage");
const About = require("../../models/About");
const Policy = require("../../models/Policy");
const Header = require("../../models/Header");
const Footer = require("../../models/Footer");

/**
 * Update a specific block/section within a CMS page
 * @route   PATCH /api/v1/admin/cms/:page/block/:blockType
 * @desc    Update a specific block content
 * @access  Admin
 */
const updateCmsBlock = async (req, res) => {
  try {
    const { page, blockType } = req.params;
    const blockData = req.body;

    if (!page) {
      return res.status(400).json({
        success: false,
        message: "Page parameter is required",
      });
    }

    if (!blockData || !blockData.id) {
      return res.status(400).json({
        success: false,
        message: "Block data with ID is required",
      });
    }

    // Map page names to models
    const pageModelMap = {
      home: { model: Homepage, title: "Home Page", arrayField: "content" },
      about: { model: About, title: "About Us", arrayField: "sections" }, // "sections" based on OurStory builder
      policies: { model: Policy, title: "Policies", arrayField: "content" },
      header: { model: Header, title: "Header", arrayField: "links" }, // Assumption
      footer: { model: Footer, title: "Footer", arrayField: "links" }, // Assumption
    };

    const pageConfig = pageModelMap[page];
    if (!pageConfig) {
      return res.status(400).json({
        success: false,
        message: `Invalid page. Must be one of: ${Object.keys(
          pageModelMap
        ).join(", ")}`,
      });
    }

    // Find the document
    const existingDoc = await pageConfig.model.findOne({});
    if (!existingDoc) {
      return res.status(404).json({
        success: false,
        message: `CMS content for '${page}' not found. Please create the page content first.`,
      });
    }

    // Determine the array field to search in
    // Fallback: Check if 'sections' exists, otherwise 'content', otherwise 'blocks'
    let targetArrayField = pageConfig.arrayField;
    const docObj = existingDoc.toObject();

    // Dynamic field detection if configured field is missing or empty
    if (!docObj[targetArrayField] || !Array.isArray(docObj[targetArrayField])) {
      if (Array.isArray(docObj.content)) targetArrayField = "content";
      else if (Array.isArray(docObj.sections)) targetArrayField = "sections";
      else if (Array.isArray(docObj.blocks)) targetArrayField = "blocks";
    }

    const currentArray = docObj[targetArrayField];

    if (!currentArray || !Array.isArray(currentArray)) {
      return res.status(400).json({
        success: false,
        message: `Could not locate content array for page '${page}'`,
      });
    }

    // Find and update the block
    const blockIndex = currentArray.findIndex((b) => b.id === blockData.id);

    // Logic: If block exists, update it. If not, maybe append? (Ideally update only)
    let updatedArray = [...currentArray];

    if (blockIndex !== -1) {
      // Update existing
      updatedArray[blockIndex] = { ...updatedArray[blockIndex], ...blockData };
    } else {
      // Block not found - could be new or mismatch
      // For localized updates, we usually expect existence.
      // But if 'save' implies create-if-missing for granular widgets...
      // Let's assume update only for SAFETY, or append if explicit?
      // Given CmsPageBuilder generates IDs, it should exist.
      // If not found, create it?
      // Let's return error if not found to be safe, or just append.
      // Appending is safer for "adding new widget and saving immediately".
      // But CmsPageBuilder saves "order" separately.

      // BETTER APPROACH: Just append/update based on ID.
      updatedArray.push(blockData);
    }

    // Update the document
    const updatePayload = { [targetArrayField]: updatedArray };

    // We update the specific array field
    const updatedDoc = await pageConfig.model.findOneAndUpdate(
      { _id: existingDoc._id },
      { $set: updatePayload },
      { new: true, runValidators: false } // flexible schema
    );

    // Finalize images found in the block data
    try {
      const {
        extractPublicIdsFromObject,
        finalizeImages,
      } = require("../../utils/mediaFinalizer");

      const imagePublicIds = extractPublicIdsFromObject(blockData);

      if (imagePublicIds.length > 0) {
        // Use the page document ID as the entity ID
        const finalizeResult = await finalizeImages(
          imagePublicIds,
          "cms",
          existingDoc._id
        );
        console.log(`✅ [CMS] Finalized images for block ${blockType}:`, {
          total: imagePublicIds.length,
          succeeded: finalizeResult.success.length,
          failed: finalizeResult.failed.length,
        });
      }
    } catch (finalizeError) {
      console.warn("⚠️ [CMS] Failed to finalize images:", finalizeError);
    }

    res.status(200).json({
      success: true,
      message: `Block updated successfully`,
      data: {
        page,
        title: pageConfig.title,
        block: blockData,
        blockType,
      },
    });
  } catch (err) {
    console.error("❌ Error updating CMS block:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  updateCmsBlock,
};
