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
        message: `Invalid page. Must be one of: ${Object.keys(
          pageModelMap
        ).join(", ")}`,
      });
    }

    // Check if document exists
    let existingDoc;
    let filter = {};
    const { slug, title: bodyTitle } = req.body; // Extract from request body, not content

    // Special handling for Policies (Multi-document)
    if (page === "policies") {
      if (!slug) {
        return res.status(400).json({
          success: false,
          message: "Slug is required for policy updates",
        });
      }
      filter = { slug };
      existingDoc = await pageConfig.model.findOne(filter);
    } else {
      // Legacy single-doc behavior
      existingDoc = await pageConfig.model.findOne({});
      if (existingDoc) {
        filter = { _id: existingDoc._id };
      }
    }

    const isNew = !existingDoc;

    // Update or create the document
    let updatedContent;

    if (page === "policies") {
      // Upsert based on slug
      // Construct document with slug, title, and content
      const docData = {
        slug,
        content, // content is the HTML string
        title:
          bodyTitle ||
          slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      };

      updatedContent = await pageConfig.model.findOneAndUpdate(
        { slug },
        docData,
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
    } else {
      // Legacy single-doc update
      if (existingDoc) {
        const mergedData = { ...existingDoc.toObject(), ...content };
        updatedContent = await pageConfig.model.findOneAndUpdate(
          filter,
          mergedData,
          { new: true, runValidators: true }
        );
      } else {
        updatedContent = await pageConfig.model.create(content);
      }
    }

    res.status(200).json({
      success: true,
      message: `CMS content for '${page}' ${
        isNew ? "created" : "updated"
      } successfully`,
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
        message: `Invalid page. Must be one of: ${Object.keys(
          pageModelMap
        ).join(", ")}`,
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
