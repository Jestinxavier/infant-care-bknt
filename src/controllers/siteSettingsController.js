const SiteSetting = require("../models/SiteSetting");

/**
 * GET /api/v1/admin/settings
 * Get all settings (optionally filtered by scope)
 */
const getAllSettings = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = scope ? { scope } : {};

    const settings = await SiteSetting.find(filter).sort({ key: 1 });

    res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/admin/settings/:key
 * Get single setting by key
 */
const getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await SiteSetting.findOne({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    res.json({
      success: true,
      setting,
    });
  } catch (error) {
    console.error("Error fetching setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch setting",
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/admin/settings
 * Create new setting
 */
const createSetting = async (req, res) => {
  try {
    const { key, value, type, scope, description, isPublic } = req.body;

    // Validate type matches value
    if (!validateType(value, type)) {
      return res.status(400).json({
        success: false,
        message: `Value type mismatch. Expected ${type}`,
      });
    }

    const setting = await SiteSetting.create({
      key,
      value,
      type,
      scope,
      description,
      isPublic,
    });

    res.status(201).json({
      success: true,
      setting,
    });
  } catch (error) {
    console.error("Error creating setting:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Setting with this key already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create setting",
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/admin/settings/:key
 * Update existing setting (developers can update scope)
 */
const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description, scope } = req.body;
    const userRole = req.user?.role;

    const setting = await SiteSetting.findOne({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    // Validate type matches
    if (value !== undefined && !validateType(value, setting.type)) {
      return res.status(400).json({
        success: false,
        message: `Value must be of type ${setting.type}`,
      });
    }

    // Only developers can change scope
    if (scope !== undefined && userRole !== "developer") {
      return res.status(403).json({
        success: false,
        message: "Only developers can change the scope",
      });
    }

    // If scope is being changed, use findOneAndUpdate to bypass immutable
    if (scope !== undefined && userRole === "developer") {
      const updatedSetting = await SiteSetting.findOneAndUpdate(
        { key },
        {
          value: value !== undefined ? value : setting.value,
          description:
            description !== undefined ? description : setting.description,
          scope,
        },
        { new: true, runValidators: true }
      );

      return res.json({
        success: true,
        setting: updatedSetting,
      });
    }

    // Normal update (no scope change)
    if (value !== undefined) setting.value = value;
    if (description !== undefined) setting.description = description;

    await setting.save();

    res.json({
      success: true,
      setting,
    });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update setting",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/admin/settings/:key
 * Delete setting
 */
const deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await SiteSetting.findOneAndDelete({ key });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: "Setting not found",
      });
    }

    res.json({
      success: true,
      message: "Setting deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete setting",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/settings/public
 * Get public settings (for frontend/storefront)
 */
const getPublicSettings = async (req, res) => {
  try {
    const { scope } = req.query;
    const filter = { isPublic: true };
    if (scope) filter.scope = scope;

    const settings = await SiteSetting.find(filter).select(
      "-_id key value type"
    );

    // Convert to key-value map for easier frontend access
    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    res.json({
      success: true,
      settings: settingsMap,
    });
  } catch (error) {
    console.error("Error fetching public settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

/**
 * Helper function to validate value type
 */
function validateType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "json":
      return typeof value === "object";
    default:
      return false;
  }
}

module.exports = {
  getAllSettings,
  getSetting,
  createSetting,
  updateSetting,
  deleteSetting,
  getPublicSettings,
};
