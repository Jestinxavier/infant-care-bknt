const Product = require("../../models/Product");
const Category = require("../../models/Category");
const { generateSlug } = require("../../utils/slugGenerator");

/**
 * Generate unique url_key for a variant
 * Format: <parent-url-key>-<variant-color>-<variant-size>
 * Uses single hyphen as per URL standards
 */
const generateVariantUrlKey = (productUrlKey, variantAttrs) => {
  if (!productUrlKey) return null;

  const parts = [productUrlKey];

  // Extract color and size from variant attributes (prefer attributes over options)
  const attrs =
    variantAttrs instanceof Map
      ? Object.fromEntries(variantAttrs)
      : variantAttrs || {};

  const color = attrs.color;
  const size = attrs.size; // Removed legacy 'age' fallback

  if (color) {
    parts.push(generateSlug(color));
  }
  if (size) {
    parts.push(generateSlug(size));
  }

  return parts.join("-");
};

/**
 * Get variants filtered by category slug with pagination and auto-generated filters
 * Returns each variant as a separate listing item with unique url_key
 */
const getVariantsByCategory = async (req, res) => {
  try {
    const { slug } = req.params;

    // Parse query filters (handles new URL structure)
    const { parseQueryFilters } = require("../../utils/parseQueryFilters");
    const filters = parseQueryFilters(req.query);

    const {
      color = filters.color,
      minPrice = filters.minPrice,
      maxPrice = filters.maxPrice,
      inStock = filters.inStock,
      sortBy = filters.sortBy,
      page = filters.page,
      limit = filters.limit,
      // Additional filters
      size = filters.size, // Removed legacy 'age' fallback
      brand = filters.brand,
      material = filters.material,
      pattern = filters.pattern,
    } = { ...req.query, ...filters };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Find category by slug
    let categoryFilter = {};
    let categoryId = null;
    let categoryTitle = "All Products"; // Default category title

    if (slug && slug !== "all") {
      const category = await Category.findOne({ slug, isActive: true });
      if (!category) {
        // If category not found, return empty results instead of error
        return res.status(200).json({
          success: true,
          categoryTitle: "Category Not Found",
          items: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0,
          },
        });
      }
      categoryFilter.category = category._id;
      categoryId = category._id;
      categoryTitle = category.name; // Set category title
    }

    // Build product filter
    let productFilter = {};
    if (Object.keys(categoryFilter).length > 0) {
      productFilter = categoryFilter;
    }

    // Find products matching category (with new structure)
    const products = await Product.find(productFilter)
      .populate("category", "name slug")
      .lean();

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        categoryTitle: "Category Not Found",
        items: [],
        pagination: {
          page: pageNum || 1,
          limit: limitNum || 20,
          total: 0,
          totalPages: 0,
        },
      });
    }

    // Process products with new structure
    let allVariantItems = [];

    for (const product of products) {
      // Process embedded variants (new structure)
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          // Apply filters
          let includeVariant = true;

          // Get attributes (prefer attributes over options) with null checks
          const variantAttrs = variant?.attributes
            ? variant.attributes instanceof Map
              ? Object.fromEntries(variant.attributes)
              : variant.attributes
            : variant?.options instanceof Map
            ? Object.fromEntries(variant.options)
            : variant?.options || {};

          // Color filter (supports array of colors) with null checks
          if (color) {
            const variantColor =
              variantAttrs?.color || variantAttrs?.get?.("color");
            const colorArray = Array.isArray(color) ? color : [color];
            if (variantColor && !colorArray.includes(variantColor)) {
              includeVariant = false;
            }
          }

          // Size filter (supports array of sizes) with null checks
          if (size) {
            const variantSize =
              variantAttrs?.size || variantAttrs?.get?.("size");
            const sizeParam = size;
            const normalize = (str) => (str || "").replace(/[–—]/g, "-").trim();

            let sizes = [];
            if (Array.isArray(sizeParam)) {
              sizes = sizeParam.map((s) => normalize(String(s)));
            } else if (
              typeof sizeParam === "string" &&
              sizeParam.includes(",")
            ) {
              sizes = sizeParam.split(",").map(normalize);
            } else if (sizeParam) {
              sizes = [normalize(String(sizeParam))];
            }

            if (
              sizes.length > 0 &&
              !sizes.some((sz) => {
                const variantSizeNormalized = normalize(variantSize || "");
                return (
                  variantSizeNormalized === sz ||
                  new RegExp(`^${sz.replace("-", "[-–—]")}$`, "i").test(
                    variantSizeNormalized
                  )
                );
              })
            ) {
              includeVariant = false;
            }
          }

          // Get stock info first with null checks
          const variantStock =
            variant?.stockObj?.available !== undefined
              ? variant.stockObj.available
              : variant?.stock || 0;
          const variantIsInStock =
            variant?.stockObj?.isInStock !== undefined
              ? variant.stockObj.isInStock
              : (variantStock ?? 0) > 0;

          // Price filter - use effective price (discountPrice if available, otherwise price) with null checks
          if (minPrice || maxPrice) {
            const variantPrice = variant?.pricing?.price || variant?.price || 0;
            const variantDiscountPrice =
              variant?.pricing?.discountPrice || variant?.discountPrice;
            // Use effective price (discountPrice if available, otherwise regular price)
            const effectivePrice =
              variantDiscountPrice && variantDiscountPrice > 0
                ? variantDiscountPrice
                : variantPrice || 0;

            if (minPrice && effectivePrice < parseFloat(String(minPrice))) {
              includeVariant = false;
            }
            if (maxPrice && effectivePrice > parseFloat(String(maxPrice))) {
              includeVariant = false;
            }
          }

          // Stock filter with null checks
          if (inStock === "true" && !variantIsInStock) {
            includeVariant = false;
          } else if (inStock === "false" && variantIsInStock) {
            includeVariant = false;
          }

          // Only include variants that are in stock (unless filtering for out-of-stock)
          if (includeVariant && (variantIsInStock || inStock === "false")) {
            // Use variant.url_key if it exists, otherwise generate it (backward compatibility)
            const variantUrlKey =
              variant?.url_key ||
              generateVariantUrlKey(product?.url_key, variantAttrs);

            // Get pricing with null checks
            const variantPrice = variant?.pricing?.price || variant?.price || 0;
            const variantDiscountPrice =
              variant?.pricing?.discountPrice || variant?.discountPrice;

            allVariantItems.push({
              _id:
                variant?.id ||
                (product?._id?.toString() || "") + "-" + (variant?.id || ""),
              url_key: variantUrlKey || product?.url_key || "",
              title: product?.title || product?.name || "",
              price: variantPrice || 0,
              discountPrice: variantDiscountPrice || null,
              stock: variantStock || 0,
              images:
                variant?.images && variant.images.length > 0
                  ? variant.images
                  : product?.images || [],
              sku: variant?.sku || null,
              productId: {
                _id: product?._id?.toString() || "",
                title: product?.title || product?.name || "",
                url_key: product?.url_key || "",
              },
              category:
                product?.category?.slug ||
                product?.categoryName?.toLowerCase().replace(/\s+/g, "-") ||
                "",
              categoryName:
                product?.category?.name || product?.categoryName || "",
              averageRating: product?.averageRating || 0,
              totalReviews: product?.totalReviews || 0,
              attributes: variantAttrs || {},
            });
          }
        }

        // If product has variants but none are inStock, add parent product
        if (product.variants && product.variants.length > 0) {
          const hasInStockVariant = product.variants.some((v) => {
            const stock =
              v.stockObj?.available !== undefined
                ? v.stockObj.available
                : v.stock || 0;
            const isInStock =
              v.stockObj?.isInStock !== undefined
                ? v.stockObj.isInStock
                : stock > 0;
            return isInStock;
          });

          if (!hasInStockVariant) {
            // No inStock variants, add parent product
            // Calculate price from all variants (even out of stock) - use effective price
            const variantPrices = product.variants
              .map((v) => {
                if (!v) return 0;
                const vPrice = v.pricing?.price || v.price || 0;
                const vDiscountPrice =
                  v.pricing?.discountPrice || v.discountPrice;
                // Use effective price (discountPrice if available, otherwise regular price)
                return vDiscountPrice && vDiscountPrice > 0
                  ? vDiscountPrice
                  : vPrice;
              })
              .filter((p) => p > 0);
            const minVariantPrice =
              variantPrices.length > 0 ? Math.min(...variantPrices) : 0;

            // Get discountPrice from variant with minVariantPrice (if available)
            let parentDiscountPrice = null;
            if (minVariantPrice > 0) {
              const variantWithMinPrice = product.variants.find((v) => {
                if (!v) return false;
                const vPrice = v.pricing?.price || v.price || 0;
                const vDiscountPrice =
                  v.pricing?.discountPrice || v.discountPrice;
                const effectivePrice =
                  vDiscountPrice && vDiscountPrice > 0
                    ? vDiscountPrice
                    : vPrice;
                return effectivePrice === minVariantPrice;
              });
              if (variantWithMinPrice) {
                parentDiscountPrice =
                  variantWithMinPrice.pricing?.discountPrice ||
                  variantWithMinPrice.discountPrice ||
                  null;
              }
            }

            // If no price from variants, check product's own price fields
            const parentPrice =
              minVariantPrice ||
              product?.pricing?.price ||
              product?.price ||
              product?.basePrice ||
              0;
            if (
              parentPrice === product?.pricing?.price ||
              parentPrice === product?.price
            ) {
              parentDiscountPrice =
                product?.pricing?.discountPrice ||
                product?.discountPrice ||
                null;
            }

            // Apply price filter to parent product (use filterMinPrice/filterMaxPrice to avoid conflict with local minPrice variable)
            let includeParent = true;
            const filterMinPrice = filters?.minPrice;
            const filterMaxPrice = filters?.maxPrice;
            if (filterMinPrice || filterMaxPrice) {
              const effectivePrice =
                parentDiscountPrice && parentDiscountPrice > 0
                  ? parentDiscountPrice
                  : parentPrice || 0;

              if (
                filterMinPrice &&
                effectivePrice < parseFloat(String(filterMinPrice))
              ) {
                includeParent = false;
              }
              if (
                filterMaxPrice &&
                effectivePrice > parseFloat(String(filterMaxPrice))
              ) {
                includeParent = false;
              }
            }

            if (includeParent) {
              allVariantItems.push({
                _id: product?._id?.toString() || "",
                url_key: product?.url_key || "",
                title: product?.title || product?.name || "",
                price: parentPrice || 0,
                discountPrice: parentDiscountPrice || null,
                stock: 0,
                images: product?.images || [],
                sku: null,
                productId: {
                  _id: product?._id?.toString() || "",
                  title: product?.title || product?.name || "",
                  url_key: product?.url_key || "",
                },
                category:
                  product?.category?.slug ||
                  product?.categoryName?.toLowerCase().replace(/\s+/g, "-") ||
                  "",
                categoryName:
                  product?.category?.name || product?.categoryName || "",
                averageRating: product?.averageRating || 0,
                totalReviews: product?.totalReviews || 0,
                attributes: {},
              });
            }
          }
        } else if (!product.variants || product.variants.length === 0) {
          // Product has no variants at all, add parent product
          // Use product's own price fields
          const parentPrice =
            product.pricing?.price || product.price || product.basePrice || 0;
          const parentDiscountPrice =
            product.pricing?.discountPrice || product.discountPrice || null;

          // Apply price filter to parent product (use filterMinPrice/filterMaxPrice to avoid conflict)
          let includeParent = true;
          const filterMinPrice = filters?.minPrice;
          const filterMaxPrice = filters?.maxPrice;
          if (filterMinPrice || filterMaxPrice) {
            const effectivePrice =
              parentDiscountPrice && parentDiscountPrice > 0
                ? parentDiscountPrice
                : parentPrice || 0;

            if (
              filterMinPrice &&
              effectivePrice < parseFloat(String(filterMinPrice))
            ) {
              includeParent = false;
            }
            if (
              filterMaxPrice &&
              effectivePrice > parseFloat(String(filterMaxPrice))
            ) {
              includeParent = false;
            }
          }

          if (includeParent) {
            allVariantItems.push({
              _id: product?._id?.toString() || "",
              url_key: product?.url_key || "",
              title: product?.title || product?.name || "",
              subtitle: product?.subtitle || null,
              price: parentPrice || 0,
              discountPrice: parentDiscountPrice || null,
              stock: 0,
              images: product?.images || [],
              sku: null,
              productId: {
                _id: product?._id?.toString() || "",
                title: product?.title || product?.name || "",
                url_key: product?.url_key || "",
              },
              category:
                product?.category?.slug ||
                product?.categoryName?.toLowerCase().replace(/\s+/g, "-") ||
                "",
              categoryName:
                product?.category?.name || product?.categoryName || "",
              averageRating: product?.averageRating || 0,
              totalReviews: product?.totalReviews || 0,
              attributes: {},
            });
          }
        }
      }
    }

    // Sorting
    let sortedItems = [...allVariantItems];
    switch (sortBy) {
      case "price_low":
      case "price-low-to-high":
        sortedItems.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price_high":
      case "price-high-to-low":
        sortedItems.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "newest":
        sortedItems.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        break;
      case "popularity":
      case "most-popular":
        sortedItems.sort(
          (a, b) => (b.totalReviews || 0) - (a.totalReviews || 0)
        );
        break;
      case "rating":
      case "highest-rated":
        sortedItems.sort(
          (a, b) => (b.averageRating || 0) - (a.averageRating || 0)
        );
        break;
      default:
        sortedItems.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
    }

    // Pagination
    const total = sortedItems.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedItems = sortedItems.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      categoryTitle: categoryTitle || "All Products",
      items: paginatedItems || [],
      pagination: {
        page: pageNum || 1,
        limit: limitNum || 20,
        total: total || 0,
        totalPages: totalPages || 0,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching variants by category:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getVariantsByCategory;
