/**
 * CSV Import/Export Controller for Product Variants
 */

const {
  exportVariantsToCSV,
  importVariantsFromCSV,
} = require("../utils/csvVariantHandler");
const Product = require("../models/Product");
const path = require("path");
const fs = require("fs");

/**
 * Export product variants to CSV
 * GET /api/admin/products/:productId/variants/export
 */
const exportVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const csv = await exportVariantsToCSV(productId);

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${product.slug || productId}-variants.csv"`
    );

    res.status(200).send(csv);
  } catch (error) {
    console.error("Error exporting variants:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export variants",
      error: error.message,
    });
  }
};

/**
 * Import product variants from CSV
 * POST /api/admin/products/:productId/variants/import
 */
const importVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const { updateExisting = true, validateOnly = false } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No CSV file uploaded",
      });
    }

    const filePath = req.file.path;

    try {
      const results = await importVariantsFromCSV(filePath, productId, {
        updateExisting,
        validateOnly,
      });

      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.status(200).json({
        success: true,
        message: validateOnly ? "Validation complete" : "Import complete",
        results,
      });
    } catch (error) {
      // Clean up uploaded file on error
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error importing variants:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import variants",
      error: error.message,
    });
  }
};

/**
 * Bulk update variant stock
 * PATCH /api/admin/products/:productId/variants/bulk-stock
 */
const bulkUpdateStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { updates } = req.body; // [{ variantId, stock }]

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let updatedCount = 0;

    updates.forEach(({ variantId, stock }) => {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant && typeof stock === "number") {
        variant.stock = stock;
        variant.stockObj = variant.stockObj || {};
        variant.stockObj.available = stock;
        variant.stockObj.isInStock = stock > 0;
        updatedCount++;
      }
    });

    await product.save();

    res.status(200).json({
      success: true,
      message: `Updated stock for ${updatedCount} variants`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error bulk updating stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update stock",
      error: error.message,
    });
  }
};

/**
 * Bulk update variant prices
 * PATCH /api/admin/products/:productId/variants/bulk-price
 */
const bulkUpdatePrice = async (req, res) => {
  try {
    const { productId } = req.params;
    const { updates } = req.body; // [{ variantId, price, discountPrice }]

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    let updatedCount = 0;

    updates.forEach(({ variantId, price, discountPrice }) => {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant && typeof price === "number") {
        variant.price = price;
        variant.pricing = variant.pricing || {};
        variant.pricing.price = price;
        if (discountPrice !== undefined) {
          variant.discountPrice = discountPrice;
          variant.pricing.discountPrice = discountPrice;
        }
        updatedCount++;
      }
    });

    await product.save();

    res.status(200).json({
      success: true,
      message: `Updated price for ${updatedCount} variants`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error bulk updating price:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update price",
      error: error.message,
    });
  }
};

module.exports = {
  exportVariants,
  importVariants,
  bulkUpdateStock,
  bulkUpdatePrice,
};
