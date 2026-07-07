const Category = require("../../models/Category");
const logger = require("../../utils/logger");
const { cacheDel } = require("../../utils/redisCache");

const createCategory = async (req, res) => {
  try {
    const {
      name,
      code,
      displayOrder,
      parentCategory,
      removeImage,
      image,
      hasSizeChart,
      sizeChartImage,
      removeSizeChartImage,
    } = req.body;
    const imageFile = req.file; // Uploaded image file (if using multer)

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (!code || code.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Category code is required",
      });
    }

    // Check if category name or code already exists
    const existingCategory = await Category.findOne({
      $or: [{ name: name.trim() }, { code: code.trim().toLowerCase() }],
      isActive: true,
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name or code already exists",
      });
    }

    const categoryData = {
      name: name.trim(),
      code: code.trim().toLowerCase(),
      displayOrder: displayOrder || 0,
      isActive: true,
      hasSizeChart: hasSizeChart === "true" || hasSizeChart === true,
    };

    if (parentCategory) {
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: "Parent category not found",
        });
      }

      // Check if parent already has a parent (limit to 2 levels)
      if (parent.parentCategory) {
        return res.status(400).json({
          success: false,
          message: "Categories can only be nested up to two levels deep",
        });
      }
      categoryData.parentCategory = parentCategory;
    }

    // Handle image - either from file upload or URL string
    if (imageFile) {
      categoryData.image = imageFile.path; // Cloudinary URL from multer
    } else if (image && !removeImage) {
      categoryData.image = image; // Direct URL from FormData
    }

    // Handle size chart image URL
    if (sizeChartImage && removeSizeChartImage !== "true" && removeSizeChartImage !== true) {
      categoryData.sizeChartImage = sizeChartImage;
    }

    const category = await Category.create(categoryData);

    // Finalize images if present
    try {
      const {
        extractPublicIdsFromObject,
        finalizeImages,
      } = require("../../utils/mediaFinalizer");

      if (category.image) {
        const imagePublicIds = extractPublicIdsFromObject(category.image);
        if (imagePublicIds.length > 0) {
          await finalizeImages(imagePublicIds, "category", category._id);
          logger.info(`✅ [Category] Finalized image for ${category.name}`);
        }
      }

      if (category.sizeChartImage) {
        const sizeChartPublicIds = extractPublicIdsFromObject(category.sizeChartImage);
        if (sizeChartPublicIds.length > 0) {
          await finalizeImages(sizeChartPublicIds, "category-size-chart", category._id);
          logger.info(`✅ [Category] Finalized size chart image for ${category.name}`);
        }
      }
    } catch (finalizeError) {
      logger.warn("⚠️ [Category] Failed to finalize images:", finalizeError);
    }

    await cacheDel("categories");

    // Trigger Next.js storefront cache revalidation
    try {
      const { triggerRevalidation } = require("../../services/revalidateService");
      await triggerRevalidation({ tag: "group:categories" });
      logger.info(`✅ [Category] Triggered storefront revalidation for creation of ${category.name}`);
    } catch (revalErr) {
      logger.warn("⚠️ [Category] Failed to trigger storefront revalidation:", revalErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    logger.error("❌ Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
          });
  }
};

module.exports = createCategory;
