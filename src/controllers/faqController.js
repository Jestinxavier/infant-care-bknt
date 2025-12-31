const FAQ = require("../models/FAQ");
const FAQCategory = require("../models/FAQCategory");

// @desc    Get all FAQs (public)
// @route   GET /api/v1/faqs
// @access  Public
exports.getAllFAQs = async (req, res) => {
  try {
    const { category, isActive, categoryId } = req.query;
    const filter = {};

    // Support both old category string (if migrated properly this shouldn't be needed but for safety)
    // and new categoryId
    if (categoryId) {
      filter.category = categoryId;
    } else if (category) {
      // If category name is passed, find the ID first
      const catDoc = await FAQCategory.findOne({ name: category });
      if (catDoc) {
        filter.category = catDoc._id;
      }
    }

    if (isActive !== undefined) filter.isActive = isActive === "true";

    const faqs = await FAQ.find(filter)
      .populate("category", "name")
      .sort({ displayOrder: 1 });

    res.status(200).json({
      success: true,
      count: faqs.length,
      faqs,
    });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create a new FAQ
// @route   POST /api/v1/faqs
// @access  Private/Admin
exports.createFAQ = async (req, res) => {
  try {
    const { question, answer, category, displayOrder, isActive } = req.body; // category here is expected to be ID

    const faq = await FAQ.create({
      question,
      answer,
      category,
      displayOrder: displayOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
      success: true,
      message: "FAQ created successfully",
      faq,
    });
  } catch (error) {
    console.error("Error creating FAQ:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update an FAQ
// @route   PUT /api/v1/faqs/:id
// @access  Private/Admin
exports.updateFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    const { question, answer, category, displayOrder, isActive } = req.body;

    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (category) faq.category = category;
    if (displayOrder !== undefined) faq.displayOrder = displayOrder;
    if (isActive !== undefined) faq.isActive = isActive;

    await faq.save();

    res.status(200).json({
      success: true,
      message: "FAQ updated successfully",
      faq,
    });
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete an FAQ
// @route   DELETE /api/v1/faqs/:id
// @access  Private/Admin
exports.deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found",
      });
    }

    await faq.deleteOne();

    res.status(200).json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting FAQ:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Reorder FAQs
// @route   PUT /api/v1/faqs/reorder
// @access  Private/Admin
exports.reorderFAQs = async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, displayOrder }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const updates = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { displayOrder: item.displayOrder } },
      },
    }));

    await FAQ.bulkWrite(updates);

    res.status(200).json({
      success: true,
      message: "FAQs reordered successfully",
    });
  } catch (error) {
    console.error("Error reordering FAQs:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};
