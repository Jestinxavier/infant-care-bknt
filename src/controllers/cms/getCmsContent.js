const Homepage = require("../../models/Homepage");
const About = require("../../models/About");
const Policy = require("../../models/Policy");
const Header = require("../../models/Header");
const Footer = require("../../models/Footer");

/**
 * Get all CMS content
 * @route   GET /api/v1/admin/cms
 * @desc    Fetch all CMS content for all pages
 * @access  Admin
 */
const getCmsContent = async (req, res) => {
  try {
    // Fetch from all separate collections
    const [homepageData, aboutData, policyData, headerData, footerData] =
      await Promise.all([
        Homepage.find({}).limit(1),
        About.find({}).limit(1),
        Policy.find({}).limit(1),
        Header.find({}).limit(1),
        Footer.find({}).limit(1),
      ]);

    const formattedContent = [];

    // Add homepage content
    if (homepageData && homepageData.length > 0) {
      formattedContent.push({
        page: "home",
        title: "Home Page",
        content: homepageData[0],
      });
    }

    // Add about content
    if (aboutData && aboutData.length > 0) {
      formattedContent.push({
        page: "about",
        title: "About Us",
        content: aboutData[0],
      });
    }

    // Add policy content
    if (policyData && policyData.length > 0) {
      formattedContent.push({
        page: "policies",
        title: "Policies",
        content: policyData[0],
      });
    }

    // Add header content
    if (headerData && headerData.length > 0) {
      formattedContent.push({
        page: "header",
        title: "Header",
        content: headerData[0],
      });
    }

    // Add footer content
    if (footerData && footerData.length > 0) {
      formattedContent.push({
        page: "footer",
        title: "Footer",
        content: footerData[0],
      });
    }

    res.status(200).json({
      success: true,
      message: "CMS content fetched successfully",
      data: formattedContent,
    });
  } catch (err) {
    console.error("❌ Error fetching CMS content:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get CMS content by page
 * @route   GET /api/v1/admin/cms/:page
 * @desc    Fetch CMS content for a specific page
 * @access  Admin
 */
const getCmsContentByPage = async (req, res) => {
  try {
    const { page } = req.params;

    const { slug } = req.query; // Get slug from query parameters

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

    let resultData = {
      page,
      title: pageConfig.title,
    };

    // Special handling for policies: Fetch ALL or by SLUG
    if (page === "policies") {
      if (slug) {
        // Expected behavior: Single Policy Document
        const policyDoc = await pageConfig.model.findOne({ slug });

        if (!policyDoc) {
          // Return empty content if not found (expected for new policy)
          resultData.content = "";
          resultData.slug = slug;
        } else {
          resultData.title = policyDoc.title || pageConfig.title;
          resultData.content = policyDoc.content;
          resultData.slug = policyDoc.slug;
        }
      } else {
        // Expected behavior: All Policy Documents
        const allPolicies = await pageConfig.model.find({});
        // Map to array of { slug, title, content }
        resultData.content = allPolicies.map((p) => ({
          slug: p.slug,
          title: p.title,
          content: p.content,
        }));
      }
    } else {
      // Default behavior for single-doc pages (home, about, etc.)
      const content = await pageConfig.model.findOne({});

      if (!content) {
        // For others, 404 might be appropriate or empty object
        return res.status(404).json({
          success: false,
          message: `CMS content for page '${page}' not found`,
        });
      }
      resultData.content = content;
    }

    res.status(200).json({
      success: true,
      message: "CMS content fetched successfully",
      data: resultData,
    });
  } catch (err) {
    console.error("❌ Error fetching CMS content:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  getCmsContent,
  getCmsContentByPage,
};
