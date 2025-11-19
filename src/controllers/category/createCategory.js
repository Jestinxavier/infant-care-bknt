const Category = require("../../models/Category");
const { cloudinary } = require("../../config/cloudinary");

const createCategory = async (req, res) => {
  try {
    const { name, description, displayOrder, parentCategory, removeImage } = req.body;
    const imageFile = req.file; // Uploaded image file

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({ 
      name: name.trim(),
      isActive: true 
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }

    const categoryData = {
      name: name.trim(),
      description: description?.trim() || "",
      displayOrder: displayOrder || 0,
      isActive: true
    };

    if (parentCategory) {
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: "Parent category not found"
        });
      }
      categoryData.parentCategory = parentCategory;
    }

    // Handle image upload
    if (imageFile) {
      categoryData.image = imageFile.path; // Cloudinary URL
    }

    const category = await Category.create(categoryData);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category
    });
  } catch (error) {
    console.error("❌ Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

module.exports = createCategory;

