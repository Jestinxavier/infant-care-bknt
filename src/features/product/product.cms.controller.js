const productService = require("./product.service");
const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

/**
 * CMS Product Controller
 * Lightweight endpoints for CMS widgets
 */
class CmsProductController {
  /**
   * Get products for CMS widgets (product slider, etc.)
   * Returns minimal fields: id, title, slug, price, image, stock
   * GET /api/v1/cms/products
   */
  getProductsForCms = asyncHandler(async (req, res) => {
    const { category, limit = 10, status = "published" } = req.query;

    // Build filter
    const filter = { status };
    if (category) {
      filter.category = category;
    }

    // Fetch products with minimal fields
    const result = await productService.getAllProducts(
      {
        category,
        limit: parseInt(limit),
        status,
        page: 1,
      },
      { isAdmin: false }
    );

    // Transform to minimal format
    const minimalProducts = result.data.map((product) => {
      // Get first image
      const image = product.images?.[0] || "";

      // Get price and discountPrice from first variant or product level
      let price = 0;
      let discountPrice = 0;
      let stock = 0;

      if (product.variants && product.variants.length > 0) {
        // Get price and stock from first available variant
        const firstVariant = product.variants[0];
        price = firstVariant.pricing?.price || firstVariant.price || 0;
        discountPrice =
          firstVariant.pricing?.discountPrice ||
          firstVariant.discountPrice ||
          0;
        stock =
          firstVariant.stockObj?.available !== undefined
            ? firstVariant.stockObj.available
            : firstVariant.stock || 0;
      } else {
        // Simple product - get from product level
        price = product.pricing?.price || product.price || 0;
        discountPrice =
          product.pricing?.discountPrice || product.discountPrice || 0;
        stock =
          product.stockObj?.available !== undefined
            ? product.stockObj.available
            : product.stock || 0;
      }

      return {
        id: product._id || product.id,
        title: product.title || product.name,
        slug: product.url_key,
        price,
        discountPrice,
        image,
        stock,
        tags: product.tags || [],
      };
    });

    // Filter out products with no stock
    const inStockProducts = minimalProducts.filter((p) => p.stock > 0);

    res.status(200).json(
      ApiResponse.success("Products fetched successfully", {
        data: inStockProducts,
        total: inStockProducts.length,
      }).toJSON()
    );
  });
}

module.exports = new CmsProductController();
