/**
 * Attribute Definition Controller
 * CRUD operations for global product attributes
 */

const AttributeDefinition = require("../models/AttributeDefinition");
const logger = require("../utils/logger");
const { normalizeCode, toTitleCase } = require("../utils/normalizeValue");
const { refreshAttributeAliasLookups } = require("../utils/filterAttributeRules");

const ATTRIBUTE_ROLES = new Set(["variant", "metadata", "both"]);

const normalizeValueToken = (value) =>
  String(value ?? "").toLowerCase().trim().replace(/\s+/g, "-");

const normalizeSynonyms = (value, synonyms) => {
  if (!Array.isArray(synonyms)) return [];
  const canonical = normalizeValueToken(value);
  return [
    ...new Set(
      synonyms
        .map(normalizeValueToken)
        .filter((s) => s && s !== canonical),
    ),
  ];
};

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
    logger.error("Error fetching attributes:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attributes",
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
    logger.error("Error fetching attribute:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch attribute",
          });
  }
};

/**
 * POST /api/v1/admin/attributes
 * Create new attribute (admin only)
 */
const createAttribute = async (req, res) => {
  try {
    const {
      code,
      label,
      type,
      uiType,
      role,
      isRequired,
      position,
      allowedValues,
    } = req.body;

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
    const normalizedCode = normalizeCode(code || label);

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
      role: ATTRIBUTE_ROLES.has(role) ? role : "metadata",
      isRequired: isRequired || false,
      position: position ?? 0,
      allowedValues: allowedValues || [],
    });

    refreshAttributeAliasLookups().catch(() => {});

    res.status(201).json({
      success: true,
      message: "Attribute created successfully",
      attribute,
    });
  } catch (error) {
    logger.error("Error creating attribute:", error);

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
    const {
      label,
      type,
      uiType,
      role,
      isRequired,
      position,
      allowedValues,
    } = req.body;

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
    if (role !== undefined) {
      if (!ATTRIBUTE_ROLES.has(role)) {
        return res.status(400).json({
          success: false,
          message: "Role must be one of: variant, metadata, both",
        });
      }
      attribute.role = role;
    }
    if (isRequired !== undefined) attribute.isRequired = isRequired;
    if (position !== undefined) attribute.position = position;
    if (allowedValues !== undefined) attribute.allowedValues = allowedValues;

    await attribute.save();
    refreshAttributeAliasLookups().catch(() => {});

    res.json({
      success: true,
      message: "Attribute updated successfully",
      attribute,
    });
  } catch (error) {
    logger.error("Error updating attribute:", error);

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
    refreshAttributeAliasLookups().catch(() => {});

    res.json({
      success: true,
      message: "Attribute deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting attribute:", error);

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
          });
  }
};

/**
 * POST /api/v1/admin/attributes/:id/values
 * Add a new allowed value to an attribute
 */
const addAllowedValue = async (req, res) => {
  try {
    const { id } = req.params;
    const { value, label, hex, synonyms } = req.body;

    if (!value || !label) {
      return res.status(400).json({
        success: false,
        message: "Value and label are required",
      });
    }

    const attribute = await AttributeDefinition.findById(id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    // Check for duplicate value (against canonical values AND existing synonyms)
    const normalizedValue = normalizeValueToken(value);
    const normalizedSynonyms = normalizeSynonyms(value, synonyms);
    const duplicate = attribute.allowedValues.some(
      (v) =>
        v.value === normalizedValue ||
        (Array.isArray(v.synonyms) &&
          v.synonyms.includes(normalizedValue)),
    );
    const synonymCollision = normalizedSynonyms.some((synonym) =>
      attribute.allowedValues.some((v) => v.value === synonym),
    );

    if (duplicate || synonymCollision) {
      return res.status(400).json({
        success: false,
        message: `Value "${normalizedValue}" already exists for this attribute`,
        errorCode: "DUPLICATE_VALUE",
      });
    }

    attribute.allowedValues.push({
      value: normalizedValue,
      label: label.trim(),
      hex: hex || undefined,
      synonyms: normalizedSynonyms,
      isActive: true,
    });

    await attribute.save();
    refreshAttributeAliasLookups().catch(() => {});

    res.status(201).json({
      success: true,
      message: "Value added successfully",
      attribute,
    });
  } catch (error) {
    logger.error("Error adding allowed value:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add value",
    });
  }
};

/**
 * PATCH /api/v1/admin/attributes/:id/values/:valueCode
 * Update an allowed value (label, hex, isActive)
 */
const updateAllowedValue = async (req, res) => {
  try {
    const { id, valueCode } = req.params;
    const { label, hex, synonyms, isActive } = req.body;

    const attribute = await AttributeDefinition.findById(id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    const valueObj = attribute.allowedValues.find(
      (v) => v.value === valueCode
    );

    if (!valueObj) {
      return res.status(404).json({
        success: false,
        message: `Value "${valueCode}" not found`,
      });
    }

    if (label !== undefined) valueObj.label = label.trim();
    if (hex !== undefined) valueObj.hex = hex;
    if (isActive !== undefined) valueObj.isActive = isActive;
    if (synonyms !== undefined) {
      valueObj.synonyms = normalizeSynonyms(valueObj.value, synonyms);
    }

    await attribute.save();
    refreshAttributeAliasLookups().catch(() => {});

    res.json({
      success: true,
      message: "Value updated successfully",
      attribute,
    });
  } catch (error) {
    logger.error("Error updating allowed value:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update value",
    });
  }
};

/**
 * DELETE /api/v1/admin/attributes/:id/values/:valueCode
 * Remove an allowed value from an attribute
 */
const removeAllowedValue = async (req, res) => {
  try {
    const { id, valueCode } = req.params;

    const attribute = await AttributeDefinition.findById(id);

    if (!attribute) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }

    const valueIndex = attribute.allowedValues.findIndex(
      (v) => v.value === valueCode
    );

    if (valueIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Value "${valueCode}" not found`,
      });
    }

    attribute.allowedValues.splice(valueIndex, 1);
    await attribute.save();
    refreshAttributeAliasLookups().catch(() => {});

    res.json({
      success: true,
      message: "Value removed successfully",
      attribute,
    });
  } catch (error) {
    logger.error("Error removing allowed value:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove value",
    });
  }
};

module.exports = {
  getAllAttributes,
  getAttributeById,
  createAttribute,
  updateAttribute,
  deleteAttribute,
  addAllowedValue,
  updateAllowedValue,
  removeAllowedValue,
};
