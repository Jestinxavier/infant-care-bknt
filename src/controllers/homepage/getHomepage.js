const Homepage = require("../../models/Homepage");

/**
 * Get homepage data from MongoDB
 * @route   GET /api/v1/homepage
 * @desc    Fetch all homepage data
 * @access  Public
 */
const getHomepage = async (req, res) => {
  try {
    // Fetch all documents from homepage collection
    const homepageData = await Homepage.find({});

    if (!homepageData || homepageData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Homepage data not found",
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "Homepage data fetched successfully",
      data: homepageData,
      count: homepageData.length,
    });
  } catch (err) {
    console.error("❌ Error fetching homepage data:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get single homepage document by ID
 * @route   GET /api/v1/homepage/:id
 * @desc    Fetch homepage data by ID
 * @access  Public
 */
const getHomepageById = async (req, res) => {
  try {
    const { id } = req.params;

    const homepageData = await Homepage.findById(id);

    if (!homepageData) {
      return res.status(404).json({
        success: false,
        message: "Homepage data not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Homepage data fetched successfully",
      data: homepageData,
    });
  } catch (err) {
    console.error("❌ Error fetching homepage data:", err);
    
    // Handle invalid ObjectId
    if (err.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid homepage ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = {
  getHomepage,
  getHomepageById,
};

