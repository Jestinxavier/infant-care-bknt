const Category = require("../../models/Category");
const { cloudinary } = require("../../config/cloudinary");

const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const {
      name,
      description,
      displayOrder,
      isActive,
      parentCategory,
      removeImage,
    } = req.body;
    const imageFile = req.file; // Uploaded image file

    if (
      !categoryId ||
      categoryId === "undefined" ||
      categoryId === "null" ||
      categoryId.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Category ID is required",
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if name is being changed and if it conflicts with existing category
    if (name && name.trim() !== category.name) {
      const existingCategory = await Category.findOne({
        name: name.trim(),
        _id: { $ne: categoryId },
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }
      category.name = name.trim();
    }

    if (displayOrder !== undefined) {
      category.displayOrder = displayOrder;
    }

    if (isActive !== undefined) {
      category.isActive = isActive;
    }

    // Handle image upload/removal
    if (imageFile) {
      // Delete old image if exists
      if (category.image) {
        const publicId = category.image.split("/").pop().split(".")[0];
        try {
          const { deleteAssets } = require("../../utils/mediaFinalizer");
          // Reconstruct public_id more reliably if possible, but folder structure varies
          // Assuming "categories/publicId" or similar.
          // Better: exact generic extraction from URL but for now assuming direct ID match or legacy logic
          // The publicId extraction here is legacy (filename only).
          // If stored as full public_id, good. If URL, it's risky.
          // Let's assume the legacy ID extraction works for legacy images,
          // but valid public_ids are usually what we need.
          // My new mediaFinalizer extracts public_id from object correctly.
          // But here we are dealing with a string URL storage.

          await deleteAssets([`categories/${publicId}`]); // Try standard path
        } catch (err) {
          console.log("⚠️ Could not delete old category image:", err.message);
        }
      }
      category.image = imageFile.path; // Cloudinary URL
    } else if (removeImage === "true" || removeImage === true) {
      // Remove image from Cloudinary if it exists
      if (category.image) {
        const publicId = category.image.split("/").pop().split(".")[0];
        try {
          const { deleteAssets } = require("../../utils/mediaFinalizer");
          await deleteAssets([`categories/${publicId}`]);
        } catch (err) {
          console.log("⚠️ Could not delete category image:", err.message);
        }
      }
      category.image = null; // Clear image field
    }

    if (parentCategory !== undefined) {
      if (parentCategory === null || parentCategory === "") {
        category.parentCategory = null;
      } else {
        // Prevent setting itself as parent
        if (parentCategory === categoryId) {
          return res.status(400).json({
            success: false,
            message: "Category cannot be its own parent",
          });
        }

        const parent = await Category.findById(parentCategory);
        if (!parent) {
          return res.status(400).json({
            success: false,
            message: "Parent category not found",
          });
        }
        category.parentCategory = parentCategory;
      }
    }

    await category.save();

    const updatedCategory = await Category.findById(categoryId).populate(
      "parentCategory",
      "name slug"
    );

    // Finalize image if present
    if (updatedCategory.image) {
      try {
        const {
          extractPublicIdsFromObject,
          finalizeImages,
        } = require("../../utils/mediaFinalizer");

        const imagePublicIds = extractPublicIdsFromObject(
          updatedCategory.image
        );

        if (imagePublicIds.length > 0) {
          await finalizeImages(imagePublicIds, "category", updatedCategory._id);
          console.log(
            `✅ [Category] Finalized image for ${updatedCategory.name}`
          );
        }
      } catch (finalizeError) {
        console.warn("⚠️ [Category] Failed to finalize image:", finalizeError);
      }
    }

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("❌ Error updating category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = updateCategory;
