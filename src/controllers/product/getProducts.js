const Product = require("../../models/Product");
const Variant = require("../../models/Variant");
const { formatProductResponse } = require("../../utils/formatProductResponse");

/**
 * Get all products - returns variants as separate items if inStock, otherwise parent product
 * Supports pagination and filtering
 */
const getAllProducts = async (req, res) => {
  try {
    // Support both GET (query params) and POST (body) requests
    const requestData = req.method === "POST" ? req.body || {} : req.query;

    // Parse query filters (handles new URL structure)
    const { parseQueryFilters } = require("../../utils/parseQueryFilters");
    const filters = parseQueryFilters(requestData);

    const {
      category,
      minRating,
      sortBy,
      page = filters.page,
      limit = filters.limit,
      // Filters - prioritize parsed filters over raw query params
      color = filters.color,
      size = filters.size || filters.age,
      minPrice = filters.minPrice,
      maxPrice = filters.maxPrice,
      inStock = filters.inStock || requestData.inStock,
    } = { ...requestData, ...filters };

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    let filter = { status: "published" }; // Only show published products on frontend
    let categoryTitle = "All Products"; // Initialize categoryTitle

    if (category && category !== "all") {
      // Find category by code (frontend passes category code, not slug)
      const Category = require("../../models/Category");
      const categoryDoc = await Category.findOne({
        code: category,
        isActive: true,
      });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
        categoryTitle = categoryDoc.name || categoryTitle; // Set category title
      } else {
        // Category not found - return empty results
        return res.status(200).json({
          success: true,
          categoryTitle: "Category not found",
          items: [],
          pagination: {
            page: pageNum || 1,
            limit: limitNum || 20,
            total: 0,
            totalPages: 0,
          },
        });
      }
    }
    if (minRating) {
      filter.averageRating = { $gte: parseFloat(minRating) };
    }

    // Search filter (smart regex)
    if (requestData.search || requestData.q) {
      const searchQuery = requestData.search || requestData.q;
      // Escape special characters for regex
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escapedQuery, $options: "i" } },
        { name: { $regex: escapedQuery, $options: "i" } },
        { description: { $regex: escapedQuery, $options: "i" } },
        { categoryName: { $regex: escapedQuery, $options: "i" } }, // assuming categoryName exists on product
      ];
    }

    // Build sort (support both 'sort' and 'sortBy' from parsed filters)
    const sortParam = sortBy || filters.sortBy;
    let sort = {};
    if (sortParam === "rating") {
      sort.averageRating = -1;
    } else if (sortParam === "reviews" || sortParam === "popularity") {
      sort.totalReviews = -1;
    } else if (sortParam === "newest") {
      sort.createdAt = -1;
    } else if (sortParam === "price_low") {
      sort.createdAt = -1; // Will sort by variant price after processing
    } else if (sortParam === "price_high") {
      sort.createdAt = -1; // Will sort by variant price after processing
    } else {
      sort.createdAt = -1; // Default: newest first
    }

    const products = await Product.find(filter)
      .populate("category", "name slug")
      .sort(sort)
      .lean();

    // Process products: return variants as separate items if inStock, otherwise parent
    let allItems = [];

    for (const product of products) {
      const productObj = product;

      // Get category info
      const categoryName = productObj.category?.name || productObj.categoryName;
      const categorySlug =
        productObj.category?.slug ||
        categoryName?.toLowerCase().replace(/\s+/g, "-");

      // Process embedded variants (new structure)
      if (productObj.variants && productObj.variants.length > 0) {
        // Filter variants based on inStock filter (if provided)
        // If inStock filter is not provided, only show inStock variants by default
        let variantsToProcess = productObj.variants;

        if (inStock === "false") {
          // Show only out-of-stock variants
          variantsToProcess = productObj.variants.filter((variant) => {
            const stock =
              variant.stockObj?.available !== undefined
                ? variant.stockObj.available
                : variant.stock || 0;
            const isInStock =
              variant.stockObj?.isInStock !== undefined
                ? variant.stockObj.isInStock
                : stock > 0;
            return !isInStock;
          });
        } else {
          // Default: show only inStock variants (or all if inStock="true" is explicitly set)
          const inStockVariants = productObj.variants.filter((variant) => {
            const stock =
              variant.stockObj?.available !== undefined
                ? variant.stockObj.available
                : variant.stock || 0;
            const isInStock =
              variant.stockObj?.isInStock !== undefined
                ? variant.stockObj.isInStock
                : stock > 0;
            return isInStock;
          });
          // If inStock="true" is explicitly set, show all variants (including out of stock)
          // Otherwise, show only inStock variants by default
          variantsToProcess =
            inStock === "true" ? productObj.variants : inStockVariants;
        }

        // If there are variants to process, add them as separate items
        if (variantsToProcess.length > 0) {
          for (const variant of variantsToProcess) {
            // Apply filters
            let includeVariant = true;

            // Get attributes
            const variantAttrs = variant.attributes
              ? variant.attributes instanceof Map
                ? Object.fromEntries(variant.attributes)
                : variant.attributes
              : variant.options instanceof Map
              ? Object.fromEntries(variant.options)
              : variant.options || {};

            // Color filter (supports array of colors)
            if (color) {
              const variantColor = variantAttrs.color;
              const colorArray = Array.isArray(color) ? color : [color];
              if (!colorArray.includes(variantColor)) includeVariant = false;
            }

            // Size/Age filter (supports array of sizes)
            if (size || filters.age) {
              const variantSize = variantAttrs.size || variantAttrs.age;
              const sizeArray = Array.isArray(size || filters.age)
                ? size || filters.age
                : [size || filters.age].filter(Boolean);
              if (sizeArray.length > 0 && !sizeArray.includes(variantSize)) {
                includeVariant = false;
              }
            }

            // Price filter - use effective price (discountPrice if available, otherwise price) with null checks
            const filterMinPrice = filters?.minPrice;
            const filterMaxPrice = filters?.maxPrice;
            if (filterMinPrice || filterMaxPrice) {
              const variantPrice =
                variant?.pricing?.price || variant?.price || 0;
              const variantDiscountPrice =
                variant?.pricing?.discountPrice || variant?.discountPrice;
              // Use effective price (discountPrice if available, otherwise regular price)
              const effectivePrice =
                variantDiscountPrice && variantDiscountPrice > 0
                  ? variantDiscountPrice
                  : variantPrice || 0;

              if (
                filterMinPrice &&
                effectivePrice < parseFloat(String(filterMinPrice))
              ) {
                includeVariant = false;
              }
              if (
                filterMaxPrice &&
                effectivePrice > parseFloat(String(filterMaxPrice))
              ) {
                includeVariant = false;
              }
            }

            // Stock filter
            const variantStock =
              variant.stockObj?.available !== undefined
                ? variant.stockObj.available
                : variant.stock || 0;
            const variantIsInStock =
              variant.stockObj?.isInStock !== undefined
                ? variant.stockObj.isInStock
                : variantStock > 0;

            if (inStock === "true" && !variantIsInStock) {
              includeVariant = false;
            } else if (inStock === "false" && variantIsInStock) {
              includeVariant = false;
            }

            if (includeVariant) {
              // Use variant.url_key if it exists, otherwise generate it (backward compatibility)
              const { generateSlug } = require("../../utils/slugGenerator");
              let variantUrlKey = variant.url_key;
              if (!variantUrlKey && productObj.url_key) {
                const parts = [productObj.url_key];
                if (variantAttrs.color)
                  parts.push(generateSlug(variantAttrs.color));
                if (variantAttrs.size || variantAttrs.age) {
                  parts.push(
                    generateSlug(variantAttrs.size || variantAttrs.age)
                  );
                }
                variantUrlKey = parts.join("-");
              }

              const variantPrice = variant.pricing?.price || variant.price || 0;
              const variantDiscountPrice =
                variant.pricing?.discountPrice || variant.discountPrice;
              const variantStock =
                variant.stockObj?.available !== undefined
                  ? variant.stockObj.available
                  : variant.stock || 0;

              allItems.push({
                _id: variant.id || `${productObj._id}-${variant.id}`,
                url_key: variantUrlKey || productObj.url_key,
                title: productObj.title || productObj.name,
                price: variantPrice,
                discountPrice: variantDiscountPrice,
                stock: variantStock,
                images:
                  variant.images && variant.images.length > 0
                    ? variant.images
                    : productObj.images || [],
                sku: variant.sku,
                productId: {
                  _id: productObj._id.toString(),
                  title: productObj.title || productObj.name,
                  url_key: productObj.url_key,
                },
                category: categorySlug || categoryName,
                categoryName: categoryName,
                averageRating: productObj.averageRating || 0,
                totalReviews: productObj.totalReviews || 0,
                attributes: variantAttrs,
                tags: productObj.tags || "",
              });
            }
          }
        } else {
          // No variants to process, add parent product (only if inStock filter allows)
          const totalStock = productObj.variants.reduce((sum, v) => {
            return (
              sum +
              (v.stockObj?.available !== undefined
                ? v.stockObj.available
                : v.stock || 0)
            );
          }, 0);
          const parentIsInStock = totalStock > 0;

          // Apply stock filter to parent products
          if (inStock === "true" && !parentIsInStock) {
            continue; // Skip parent products without stock when filtering for inStock
          } else if (inStock === "false" && parentIsInStock) {
            continue; // Skip parent products with stock when filtering for out-of-stock
          }
          // Calculate price from all variants (even out of stock) - use effective price
          const variantPrices = productObj.variants
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
            const variantWithMinPrice = productObj.variants.find((v) => {
              if (!v) return false;
              const vPrice = v.pricing?.price || v.price || 0;
              const vDiscountPrice =
                v.pricing?.discountPrice || v.discountPrice;
              const effectivePrice =
                vDiscountPrice && vDiscountPrice > 0 ? vDiscountPrice : vPrice;
              return effectivePrice === minVariantPrice;
            });
            if (variantWithMinPrice) {
              parentDiscountPrice =
                variantWithMinPrice.pricing?.discountPrice ||
                variantWithMinPrice.discountPrice ||
                null;
            }
          }

          // Fallback to product's own price fields if no variant prices
          const parentPrice =
            minVariantPrice ||
            productObj?.pricing?.price ||
            productObj?.price ||
            productObj?.basePrice ||
            0;
          if (
            parentPrice === productObj?.pricing?.price ||
            parentPrice === productObj?.price
          ) {
            parentDiscountPrice =
              productObj?.pricing?.discountPrice ||
              productObj?.discountPrice ||
              null;
          }

          // Apply price filter to parent products
          const filterMinPrice = filters?.minPrice;
          const filterMaxPrice = filters?.maxPrice;
          let includeParent = true;

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

          if (!includeParent) {
            continue;
          }

          allItems.push({
            _id: productObj._id.toString(),
            url_key: productObj.url_key,
            title: productObj.title || productObj.name,
            price: parentPrice,
            discountPrice: parentDiscountPrice,
            stock: totalStock,
            images: productObj.images || [],
            sku: null,
            productId: {
              _id: productObj._id.toString(),
              title: productObj.title || productObj.name,
              url_key: productObj.url_key,
            },
            category: categorySlug || categoryName,
            categoryName: categoryName,
            averageRating: productObj.averageRating || 0,
            totalReviews: productObj.totalReviews || 0,
            attributes: {},
            tags: productObj.tags || "",
          });
        }
      } else {
        // No variants, add parent product
        // Use product's own price fields
        const parentPrice =
          productObj.pricing?.price ||
          productObj.price ||
          productObj.basePrice ||
          0;
        const parentDiscountPrice =
          productObj.pricing?.discountPrice || productObj.discountPrice || null;

        // Apply stock filter to products without variants
        // Check actual stock value first, then fallback to isInStock flag
        const productStock =
          productObj.stockObj?.available !== undefined
            ? productObj.stockObj.available
            : productObj.stock !== undefined
            ? productObj.stock
            : 0;
        // Product is in stock if stock > 0, regardless of isInStock flag
        const productIsInStock = productStock > 0;

        // Apply stock filter - inStock can be "true", "false", true, false, or undefined
        // Normalize inStock to string for comparison
        const inStockFilter = String(inStock).toLowerCase();
        if (inStockFilter === "true" && !productIsInStock) {
          continue; // Skip products without stock when filtering for inStock
        } else if (inStockFilter === "false" && productIsInStock) {
          continue; // Skip products with stock when filtering for out-of-stock
        }

        // Apply price filter to products without variants
        const filterMinPrice = filters?.minPrice;
        const filterMaxPrice = filters?.maxPrice;
        let includeProduct = true;

        if (filterMinPrice || filterMaxPrice) {
          const effectivePrice =
            parentDiscountPrice && parentDiscountPrice > 0
              ? parentDiscountPrice
              : parentPrice || 0;

          if (
            filterMinPrice &&
            effectivePrice < parseFloat(String(filterMinPrice))
          ) {
            includeProduct = false;
          }
          if (
            filterMaxPrice &&
            effectivePrice > parseFloat(String(filterMaxPrice))
          ) {
            includeProduct = false;
          }
        }

        if (!includeProduct) {
          continue;
        }

        allItems.push({
          _id: productObj._id.toString(),
          url_key: productObj.url_key,
          title: productObj.title || productObj.name,
          subtitle: productObj.subtitle,
          price: parentPrice,
          discountPrice: parentDiscountPrice,
          stock: productStock,
          images: productObj.images || [],
          sku: null,
          productId: {
            _id: productObj._id.toString(),
            title: productObj.title || productObj.name,
            url_key: productObj.url_key,
          },
          category: categorySlug || categoryName,
          categoryName: categoryName,
          averageRating: productObj.averageRating || 0,
          totalReviews: productObj.totalReviews || 0,
          attributes: {},
          tags: productObj.tags || "",
        });
      }
    }

    // Sorting - use effective price (discountPrice if available, otherwise price)
    let sortedItems = [...allItems];
    if (sortBy === "price_low") {
      sortedItems.sort((a, b) => {
        const aEffectivePrice =
          a.discountPrice && a.discountPrice > 0
            ? a.discountPrice
            : a.price || 0;
        const bEffectivePrice =
          b.discountPrice && b.discountPrice > 0
            ? b.discountPrice
            : b.price || 0;
        return aEffectivePrice - bEffectivePrice;
      });
    } else if (sortBy === "price_high") {
      sortedItems.sort((a, b) => {
        const aEffectivePrice =
          a.discountPrice && a.discountPrice > 0
            ? a.discountPrice
            : a.price || 0;
        const bEffectivePrice =
          b.discountPrice && b.discountPrice > 0
            ? b.discountPrice
            : b.price || 0;
        return bEffectivePrice - aEffectivePrice;
      });
    } else if (sortBy === "rating") {
      sortedItems.sort(
        (a, b) => (b.averageRating || 0) - (a.averageRating || 0)
      );
    } else if (sortBy === "popularity") {
      sortedItems.sort((a, b) => (b.totalReviews || 0) - (a.totalReviews || 0));
    }

    // Pagination
    const total = sortedItems.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedItems = sortedItems.slice(skip, skip + limitNum);

    // Use first item's category name if categoryTitle wasn't set from category filter
    if (
      categoryTitle === "All Products" &&
      paginatedItems.length > 0 &&
      paginatedItems[0]?.categoryName
    ) {
      categoryTitle = paginatedItems[0].categoryName;
    }

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
    console.error("❌ Error fetching products:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get single product by url_key with variants and ratings
 * Supports backward compatibility with _id lookup
 */
const getProductByUrlKey = async (req, res) => {
  try {
    // Support both GET (params) and POST (body or params) requests
    const url_key = req.params.url_key || req.body?.url_key;

    // Validate url_key
    if (!url_key || url_key === "undefined" || url_key === "null") {
      return res.status(400).json({
        success: false,
        message: "Product url_key is required",
      });
    }

    // Use MongoDB $or query to find product by either parent url_key or variant url_key
    // This is more efficient and explicit - no guesswork needed
    let product = await Product.findOne({
      $or: [
        { url_key: url_key }, // Parent product
        { "variants.url_key": url_key }, // Variant
      ],
    }).populate("category", "name slug");

    // Find the specific variant if slug matches a variant url_key
    let variantFromUrl = null;
    if (product && product.variants && product.variants.length > 0) {
      variantFromUrl =
        product.variants.find((v) => v.url_key === url_key) || null;
    }

    // Backward compatibility: if not found by url_key, try _id
    if (!product) {
      // Check if it's a valid ObjectId format
      if (/^[0-9a-fA-F]{24}$/.test(url_key)) {
        product = await Product.findById(url_key).populate(
          "category",
          "name slug"
        );
      }
    }

    // Additional fallback: try to find by slugified name/title
    // This helps with products that don't have url_key yet
    if (!product) {
      // Try to find by matching slugified title or name
      product = await Product.findOne({
        $or: [
          {
            title: {
              $regex: new RegExp(`^${url_key.replace(/-/g, " ")}`, "i"),
            },
          },
          {
            name: { $regex: new RegExp(`^${url_key.replace(/-/g, " ")}`, "i") },
          },
        ],
      }).populate("category", "name slug");
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Only return published products on frontend
    if (product.status !== "published") {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // If product doesn't have url_key, generate one now
    if (!product.url_key) {
      const { generateUniqueUrlKey } = require("../../utils/slugGenerator");
      const checkUrlKeyExists = async (key) => {
        const existing = await Product.findOne({
          url_key: key,
          _id: { $ne: product._id },
        });
        return !!existing;
      };
      product.url_key = await generateUniqueUrlKey(
        product.title || product.name,
        checkUrlKeyExists
      );
      await product.save();
    }

    // Convert product to object
    const productObj = product.toObject();
    productObj._id = productObj._id?.toString() || productObj._id;

    // Populate category if it's an ObjectId reference
    if (productObj.category && typeof productObj.category === "object") {
      productObj.categoryId =
        productObj.category._id?.toString() || productObj.category._id;
      productObj.categoryName =
        productObj.category.name || productObj.categoryName;
    } else if (!productObj.categoryName && productObj.category) {
      productObj.categoryName = productObj.category;
    }

    // Legacy support: also check Variant collection for backward compatibility
    const legacyVariants = await Variant.find({ productId: product._id });
    if (
      legacyVariants.length > 0 &&
      (!productObj.variants || productObj.variants.length === 0)
    ) {
      productObj.variants = legacyVariants.map((v) => ({
        id: v._id.toString(),
        sku: v.sku,
        price: v.price,
        stock: v.stock,
        images: v.images || [],
        options: {
          color: v.color,
          age: v.age,
        },
      }));
    }

    // Format response in new structure
    const formattedProduct = formatProductResponse(product);

    res.status(200).json({
      success: true,
      ...formattedProduct,
    });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get single product by ID (legacy support)
 * @deprecated Use getProductByUrlKey instead
 */
const getProductById = async (req, res) => {
  try {
    // Support both GET (params) and POST (body or params) requests
    const productId = req.params.productId || req.body?.productId;

    // Validate productId
    if (!productId || productId === "undefined" || productId === "null") {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    const product = await Product.findById(productId).populate(
      "category",
      "name slug"
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Get all variants for this product (legacy)
    const variants = await Variant.find({ productId });

    // Ensure _id is a string
    const productObj = product.toObject();
    productObj._id = productObj._id?.toString() || productObj._id;

    // Populate category if it's an ObjectId reference
    if (productObj.category && typeof productObj.category === "object") {
      productObj.categoryId =
        productObj.category._id?.toString() || productObj.category._id;
      productObj.categoryName =
        productObj.category.name || productObj.categoryName;
    } else if (!productObj.categoryName && productObj.category) {
      productObj.categoryName = productObj.category;
    }

    const variantsWithStringIds = variants.map((v) => {
      const variantObj = v.toObject();
      variantObj._id = variantObj._id?.toString() || variantObj._id;
      return variantObj;
    });

    res.status(200).json({
      success: true,
      product: productObj,
      variants: variantsWithStringIds,
      totalVariants: variants.length,
    });
  } catch (err) {
    console.error("❌ Error fetching product:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

/**
 * Get variant by ID with rating information
 */
const getVariantById = async (req, res) => {
  try {
    const { variantId } = req.params;

    const variant = await Variant.findById(variantId).populate(
      "productId",
      "name description category averageRating totalReviews"
    );

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: "Variant not found",
      });
    }

    res.status(200).json({
      success: true,
      variant,
    });
  } catch (err) {
    console.error("❌ Error fetching variant:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

const getSearchIndex = async (req, res) => {
  console.log("🔍 Search Index API called");
  try {
    // Fetch all published products with minimal fields
    const products = await Product.find({ status: { $ne: "rejected" } })
      .select(
        "title name url_key images pricing price category status variants"
      )
      .populate("category", "name slug")
      .lean();

    console.log(`✅ Found ${products.length} products for index`);

    const searchIndex = products.map((product) => {
      // Get effective price
      const parentPrice = product.pricing?.price || product.price || 0;

      // Calculate min price from variants if any
      let minPrice = parentPrice;
      if (product.variants && product.variants.length > 0) {
        const variantPrices = product.variants
          .map((v) => v.pricing?.price || v.price || 0)
          .filter((p) => p > 0);
        if (variantPrices.length > 0) minPrice = Math.min(...variantPrices);
      } else if (parentPrice === 0 && product.price) {
        minPrice = product.price;
      }

      // Image
      const image = (product.images && product.images[0]) || "";

      return {
        id: product._id,
        title: product.title || product.name,
        url_key: product.url_key,
        price: minPrice,
        image: image,
        category: product.category?.name || "Uncategorized",
        status: product.status,
      };
    });

    res.status(200).json({
      success: true,
      products: searchIndex,
    });
  } catch (error) {
    console.error("❌ Error fetching search index:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex,
};
