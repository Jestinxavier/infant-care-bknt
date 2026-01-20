/**
 * Attribute Definition Controller
 * CRUD operations for global product attributes
 */

const AttributeDefinition = require("../models/AttributeDefinition");
const { normalizeCode, toTitleCase } = require("../utils/normalizeValue");

/**
 * GET /api/v1/attributes
 * List all attribute definitions (public)
 */
const getAllAttributes = async (req, res) => {
  try {
    const attributes = await AttributeDefinition.find()
      .sort({ position: 1, createdAt: 1 })
      .select("-__v");

    res.json({
      success: true,
      attributes,
      count: attributes.length,
    });
  } catch (error) {
    console.error("Error fetching attributes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attributes",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/attributes/:id
 * Get single attribute by ID (public)
 */
const getAttributeById = async (req, res) => {
  try {
    const { id } = req.params;

    const attribute = await AttributeDefinition.findById(id).select("-__v");

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    res.json({
      success: true,
      attribute,
    });
  } catch (error) {
    console.error("Error fetching attribute:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attribute",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/admin/attributes
 * Create new attribute (admin only)
 */
const createAttribute = async (req, res) => {
  try {
    const { code, label, type, uiType, isRequired, position } = req.body;

    // Validate required fields
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Attribute code is required",
      });
    }

    if (!label) {
      return res.status(400).json({
        success: false,
        message: "Attribute label is required",
      });
    }

    // Normalize code
    const normalizedCode = normalizeCode(code);

    // Check if code is valid
    if (!/^[a-z][a-z0-9_]*$/.test(normalizedCode)) {
      return res.status(400).json({
        success: false,
        message:
          "Code must start with a letter and contain only lowercase letters, numbers, and underscores",
      });
    }

    // Create attribute
    const attribute = await AttributeDefinition.create({
      code: normalizedCode,
      label: label.trim(),
      type: type || "enum",
      uiType: uiType || "dropdown",
      isRequired: isRequired || false,
      position: position ?? 0,
    });

    res.status(201).json({
      success: true,
      message: "Attribute created successfully",
      attribute,
    });
  } catch (error) {
    console.error("Error creating attribute:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Attribute with code "${req.body.code}" already exists`,
        errorCode: "DUPLICATE_CODE",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
        errors: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create attribute",
      error: error.message,
    });
  }
};

/**
 * PATCH /api/v1/admin/attributes/:id
 * Update attribute (admin only) - code cannot be changed
 */
const updateAttribute = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, type, uiType, isRequired, position } = req.body;

    // Find attribute
    const attribute = await AttributeDefinition.findById(id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    // Check if trying to update code (not allowed)
    if (req.body.code && req.body.code !== attribute.code) {
      return res.status(400).json({
        success: false,
        message: "Attribute code cannot be changed after creation",
        errorCode: "CODE_IMMUTABLE",
      });
    }

    // Update allowed fields
    if (label !== undefined) attribute.label = label.trim();
    if (type !== undefined) attribute.type = type;
    if (uiType !== undefined) attribute.uiType = uiType;
    if (isRequired !== undefined) attribute.isRequired = isRequired;
    if (position !== undefined) attribute.position = position;

    await attribute.save();

    res.json({
      success: true,
      message: "Attribute updated successfully",
      attribute,
    });
  } catch (error) {
    console.error("Error updating attribute:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(", "),
        errors: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update attribute",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/admin/attributes/:id
 * Delete attribute (admin only) - blocked if in use
 */
const deleteAttribute = async (req, res) => {
  try {
    const { id } = req.params;

    const attribute = await AttributeDefinition.findById(id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    // Check if attribute is in use
    if (attribute.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete attribute "${attribute.code}" - it is used by ${attribute.usageCount} product(s)`,
        errorCode: "ATTRIBUTE_IN_USE",
        usageCount: attribute.usageCount,
      });
    }

    await attribute.deleteOne();

    res.json({
      success: true,
      message: "Attribute deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting attribute:", error);

    if (error.name === "AttributeInUseError") {
      return res.status(400).json({
        success: false,
        message: error.message,
        errorCode: "ATTRIBUTE_IN_USE",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete attribute",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAttributes,
  getAttributeById,
  createAttribute,
  updateAttribute,
  deleteAttribute,
};
