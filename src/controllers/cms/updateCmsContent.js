const Homepage = require("../../models/Homepage");
const About = require("../../models/About");
const Policy = require("../../models/Policy");
const Header = require("../../models/Header");
const Footer = require("../../models/Footer");

/**
 * Create or update CMS content for a specific page
 * @route   POST /api/v1/admin/cms
 * @route   PUT /api/v1/admin/cms/:page
 * @desc    Create or update CMS content
 * @access  Admin
 */
const updateCmsContent = async (req, res) => {
  try {
    // Get page from body or params
    const page = req.body.page || req.params.page;
    const { content } = req.body;

    // Validate required fields
    if (!page) {
      return res.status(400).json({
        success: false,
        message: "Page field is required",
      });
    }

    if (content === undefined || content === null) {
      return res.status(400).json({
        success: false,
        message: "Content field is required",
      });
    }

    // Map page names to models and titles
    const pageModelMap = {
      home: { model: Homepage, title: "Home Page" },
      about: { model: About, title: "About Us" },
      policies: { model: Policy, title: "Policies" },
      header: { model: Header, title: "Header" },
      footer: { model: Footer, title: "Footer" },
    };

    const pageConfig = pageModelMap[page];
    if (!pageConfig) {
      return res.status(400).json({
        success: false,
        message: `Invalid page. Must be one of: ${Object.keys(pageModelMap).join(", ")}`,
      });
    }

    // Check if document exists
    const existingDoc = await pageConfig.model.findOne({});
    const isNew = !existingDoc;

    // Update or create the document
    // Since these are flexible schemas, we merge the content with existing data
    let updatedContent;
    if (existingDoc) {
      // Merge new content with existing document
      const mergedData = { ...existingDoc.toObject(), ...content };
      updatedContent = await pageConfig.model.findOneAndUpdate(
        { _id: existingDoc._id },
        mergedData,
        { new: true, runValidators: true }
      );
    } else {
      // Create new document with content
      updatedContent = await pageConfig.model.create(content);
    }

    res.status(200).json({
      success: true,
      message: `CMS content for '${page}' ${isNew ? 'created' : 'updated'} successfully`,
      data: {
        page,
        title: pageConfig.title,
        content: updatedContent,
      },
    });
  } catch (err) {
    console.error("❌ Error updating CMS content:", err);
    
    // Handle validation errors
    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Delete CMS content for a specific page
 * @route   DELETE /api/v1/admin/cms/:page
 * @desc    Delete CMS content
 * @access  Admin
 */
const deleteCmsContent = async (req, res) => {
  try {
    const { page } = req.params;

    // Map page names to models
    const pageModelMap = {
      home: { model: Homepage, title: "Home Page" },
      about: { model: About, title: "About Us" },
      policies: { model: Policy, title: "Policies" },
      header: { model: Header, title: "Header" },
      footer: { model: Footer, title: "Footer" },
    };

    const pageConfig = pageModelMap[page];
    if (!pageConfig) {
      return res.status(400).json({
        success: false,
        message: `Invalid page. Must be one of: ${Object.keys(pageModelMap).join(", ")}`,
      });
    }

    // Delete from the appropriate collection
    const deletedContent = await pageConfig.model.findOneAndDelete({});

    if (!deletedContent) {
      return res.status(404).json({
        success: false,
        message: `CMS content for page '${page}' not found`,
      });
    }

    res.status(200).json({
      success: true,
      message: `CMS content for '${page}' deleted successfully`,
    });
  } catch (err) {
    console.error("❌ Error deleting CMS content:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  updateCmsContent,
  deleteCmsContent,
};

