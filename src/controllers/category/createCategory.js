const Category = require("../../models/Category");
const { cloudinary } = require("../../config/cloudinary");

const createCategory = async (req, res) => {
  try {
    const { name, code, displayOrder, parentCategory, removeImage, image } =
      req.body;
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

    const category = await Category.create(categoryData);

    // Finalize image if present
    try {
      if (category.image) {
        const {
          extractPublicIdsFromObject,
          finalizeImages,
        } = require("../../utils/mediaFinalizer");

        const imagePublicIds = extractPublicIdsFromObject(category.image);

        if (imagePublicIds.length > 0) {
          await finalizeImages(imagePublicIds, "category", category._id);
          console.log(`✅ [Category] Finalized image for ${category.name}`);
        }
      }
    } catch (finalizeError) {
      console.warn("⚠️ [Category] Failed to finalize image:", finalizeError);
    }

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    console.error("❌ Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = createCategory;
