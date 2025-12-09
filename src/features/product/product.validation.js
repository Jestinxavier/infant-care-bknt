const { body, param, query } = require("express-validator");

/**
 * Product Validation Rules
 * Using express-validator for request validation
 */

const productValidation = {
  // Create product validation
  create: [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ min: 3, max: 200 })
      .withMessage("Title must be between 3 and 200 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage("Description must not exceed 5000 characters"),
    body("category")
      .notEmpty()
      .withMessage("Category is required")
      .isMongoId()
      .withMessage("Invalid category ID"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid status"),
    body("variants")
      .optional()
      .isArray()
      .withMessage("Variants must be an array"),
    body("variants.*.sku")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("SKU is required for each variant"),
    body("variants.*.price")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Price must be a positive number"),
  ],

  // Update product validation
  update: [
    param("id").isMongoId().withMessage("Invalid product ID"),
    body("title")
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage("Title must be between 3 and 200 characters"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid status"),
  ],

  // Get products validation (query params)
  list: [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("category").optional().isMongoId().withMessage("Invalid category ID"),
    query("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid status"),
    query("minPrice")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Min price must be a positive number"),
    query("maxPrice")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Max price must be a positive number"),
  ],

  // Get product by ID validation
  getById: [param("id").isMongoId().withMessage("Invalid product ID")],

  // Delete product validation
  delete: [param("id").isMongoId().withMessage("Invalid product ID")],
};

module.exports = productValidation;
