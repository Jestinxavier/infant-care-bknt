const productService = require("./product.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

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
          result.pagination
        ).toJSON()
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
        ApiResponse.success("Product fetched successfully", product).toJSON()
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
        ApiResponse.success("Product created successfully", product).toJSON()
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
        ApiResponse.success("Product updated successfully", product).toJSON()
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
          product
        ).toJSON()
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
        ApiResponse.success("Products status updated successfully").toJSON()
      );
  });
}

module.exports = new ProductAdminController();
