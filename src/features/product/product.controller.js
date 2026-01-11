const productService = require("./product.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

/**
 * Product Controller (Storefront)
 * Handles HTTP requests/responses
 * Delegates all business logic to ProductService
 */
class ProductController {
  /**
   * Get all products (storefront - only published)
   */
  getAllProducts = asyncHandler(async (req, res) => {
    const filters = req.query;
    const result = await productService.getAllProducts(filters, {
      isAdmin: false,
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
   * Get product by ID (storefront)
   */
  getProductById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await productService.getProductById(id, { isAdmin: false });

    res
      .status(200)
      .json(
        ApiResponse.success("Product fetched successfully", product).toJSON()
      );
  });

  /**
   * Get product by URL key (storefront)
   */
  getProductByUrlKey = asyncHandler(async (req, res) => {
    const { urlKey } = req.params;
    const product = await productService.getProductByUrlKey(urlKey, {
      isAdmin: false,
    });

    res
      .status(200)
      .json(
        ApiResponse.success("Product fetched successfully", product).toJSON()
      );
  });

  /**
   * Search products (storefront)
   */
  searchProducts = asyncHandler(async (req, res) => {
    const { q, page, limit, product_type } = req.query;
    const result = await productService.searchProducts(q, {
      page,
      limit,
      product_type, // Pass through for bundle child picker
    });

    res
      .status(200)
      .json(
        ApiResponse.paginated(
          "Products found",
          result.data,
          result.pagination
        ).toJSON()
      );
  });
}

module.exports = new ProductController();
