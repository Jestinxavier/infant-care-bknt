const productService = require("./product.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");
const { validateSku } = require("../../utils/skuGenerator");
const { validateUrlKey } = require("../../utils/slugGenerator");

/**
 * Product Admin Controller
 * Handles admin-specific product operations
 * Reuses ProductService but with admin privileges
 */
class ProductAdminController {
  /**
   * Get all products (admin - includes drafts and archived)
   */
  getAllProducts = asyncHandler(async (req, res) => {
    const filters = req.query;
    const result = await productService.getAllProducts(filters, {
      isAdmin: true,
    });

    res
      .status(200)
      .json(
        ApiResponse.paginated(
          "Products fetched successfully",
          result.data,
          result.pagination,
        ).toJSON(),
      );
  });

  /**
   * Get product by ID (admin - can access drafts)
   */
  getProductById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await productService.getProductById(id, { isAdmin: true });

    res
      .status(200)
      .json(
        ApiResponse.success("Product fetched successfully", product).toJSON(),
      );
  });

  /**
   * Create product (admin only)
   */
  createProduct = asyncHandler(async (req, res) => {
    const product = await productService.createProduct(req.body);

    res
      .status(201)
      .json(
        ApiResponse.success("Product created successfully", product).toJSON(),
      );
  });

  /**
   * Update product (admin only)
   */
  updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await productService.updateProduct(id, req.body);

    res
      .status(200)
      .json(
        ApiResponse.success("Product updated successfully", product).toJSON(),
      );
  });

  /**
   * Delete product (admin only)
   */
  deleteProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await productService.deleteProduct(id);

    res
      .status(200)
      .json(ApiResponse.success("Product deleted successfully").toJSON());
  });

  /**
   * Update product status (admin only)
   */
  updateProductStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const product = await productService.updateProductStatus(id, status);

    res
      .status(200)
      .json(
        ApiResponse.success(
          "Product status updated successfully",
          product,
        ).toJSON(),
      );
  });

  /**
   * Bulk update product status (admin only)
   */
  bulkUpdateStatus = asyncHandler(async (req, res) => {
    const { productIds, status } = req.body;
    await productService.bulkUpdateStatus(productIds, status);

    res
      .status(200)
      .json(
        ApiResponse.success("Products status updated successfully").toJSON(),
      );
  });

  /**
   * Check SKU availability
   */
  checkSkuAvailability = asyncHandler(async (req, res) => {
    const { sku } = req.params;
    const { excludeProductId } = req.query;

    // Validate SKU format
    const skuValidation = validateSku(sku);
    if (!skuValidation.valid) {
      return res.status(400).json(
        ApiResponse.error("Invalid SKU format", {
          validation: skuValidation.error,
        }).toJSON(),
      );
    }

    const isAvailable = await productService.checkSkuAvailable(
      sku,
      excludeProductId,
    );

    res.status(200).json(
      ApiResponse.success("SKU availability checked", {
        sku,
        available: isAvailable,
      }).toJSON(),
    );
  });

  /**
   * Check URL key availability
   */
  checkUrlKeyAvailability = asyncHandler(async (req, res) => {
    const { urlKey } = req.params;
    const { excludeProductId } = req.query;

    // Validate URL key format
    const urlKeyValidation = validateUrlKey(urlKey);
    if (!urlKeyValidation.valid) {
      return res.status(400).json(
        ApiResponse.error("Invalid URL key format", {
          validation: urlKeyValidation.error,
        }).toJSON(),
      );
    }

    const isAvailable = await productService.checkUrlKeyAvailable(
      urlKey,
      excludeProductId,
    );

    res.status(200).json(
      ApiResponse.success("URL key availability checked", {
        urlKey,
        available: isAvailable,
      }).toJSON(),
    );
  });

  /**
   * Generate SKU suggestion
   */
  generateSkuSuggestion = asyncHandler(async (req, res) => {
    const { productName } = req.body;
    const { prefix, suffix, maxLength } = req.body;

    if (!productName) {
      return res
        .status(400)
        .json(ApiResponse.error("Product name is required").toJSON());
    }

    const suggestion = await productService.generateSkuSuggestion(productName, {
      prefix,
      suffix,
      maxLength,
    });

    res.status(200).json(
      ApiResponse.success("SKU suggestion generated", {
        suggestion,
      }).toJSON(),
    );
  });

  /**
   * Lock product SKU (called when used in orders)
   */
  lockProductSku = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await productService.lockProductSku(id);

    res
      .status(200)
      .json(ApiResponse.success("Product SKU locked successfully").toJSON());
  });

  /**
   * Lock variant SKU (called when used in orders)
   */
  lockVariantSku = asyncHandler(async (req, res) => {
    const { id, variantId } = req.params;

    await productService.lockVariantSku(id, variantId);

    res
      .status(200)
      .json(ApiResponse.success("Variant SKU locked successfully").toJSON());
  });
}

module.exports = new ProductAdminController();
