const ApiResponse = require("../../core/ApiResponse");
const asyncHandler = require("../../core/middleware/asyncHandler");

/**
 * Get first image URL from product or variant.
 * Handles both shapes: images[0] as { url } or images[0] as string (legacy).
 */
function getFirstImageUrl(images) {
  const first = images?.[0];
  if (!first) return "";
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && first.url) return first.url;
  return "";
}

/**
 * Return the offer price only when the offer is currently active (within date range).
 * Otherwise return null so the UI shows the regular price.
 * - No offerStartAt/offerEndAt: offer is always active (legacy).
 */
function getActiveOfferPrice(item) {
  const offerPrice = item.offerPrice ?? null;
  if (offerPrice == null || offerPrice <= 0) return null;
  const now = new Date();
  if (item.offerStartAt && now < new Date(item.offerStartAt)) return null;
  if (item.offerEndAt && now > new Date(item.offerEndAt)) return null;
  return offerPrice;
}

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
    const {
      category: categoryCode,
      limit = 10,
      status = "published",
    } = req.query;

    // Look up category by code and convert to ObjectId for filtering
    let filters = {
      limit: parseInt(limit),
      status,
      page: 1,
    };

    if (categoryCode) {
      const Category = require("../../models/Category");
      const category = await Category.findOne({
        code: categoryCode.toLowerCase(),
      });

      if (!category) {
        return res
          .status(404)
          .json(ApiResponse.error("Category not found", 404).toJSON());
      }

      // Products store category as ObjectId reference
      filters.category = category._id;
    }

    // Fetch full product data (not aggregated items)
    const Product = require("./product.model");
    const products = await Product.find(
      filters.category
        ? {
            category: filters.category,
            status: filters.status,
            product_type: { $in: ["SIMPLE", "CONFIGURABLE"] },
          }
        : {
            status: filters.status,
            product_type: { $in: ["SIMPLE", "CONFIGURABLE"] },
          }
    )
      .limit(filters.limit * 3) // Fetch more to account for filtering
      .lean();

    // Transform and filter products
    const minimalProducts = products
      .map((product) => {
        let price = 0;
        let discountPrice = 0;
        let stock = 0;
        let image = "";

        if (
          product.product_type === "CONFIGURABLE" &&
          product.variants?.length > 0
        ) {
          // CONFIGURABLE: Check if ANY variant has stock
          const availableVariants = product.variants.filter((v) => {
            const variantStock = v.stockObj?.available ?? v.stock ?? 0;
            return variantStock > 0;
          });

          if (availableVariants.length === 0) {
            return null; // Skip this product - no variants in stock
          }

          // Use first available variant for display
          const firstVariant = availableVariants[0];
          price = firstVariant.price ?? 0;
          discountPrice = getActiveOfferPrice(firstVariant) ?? 0;
          stock = firstVariant.stockObj?.available ?? firstVariant.stock ?? 0;
          image =
            getFirstImageUrl(firstVariant.images) ||
            getFirstImageUrl(product.images) ||
            "";
        } else if (product.product_type === "SIMPLE") {
          // SIMPLE: Check product-level stock
          stock = product.stockObj?.available ?? product.stock ?? 0;

          if (stock === 0) {
            return null; // Skip this product - out of stock
          }

          price = product.price ?? 0;
          discountPrice = getActiveOfferPrice(product) ?? 0;
          image = getFirstImageUrl(product.images) || "";
        } else {
          return null; // Skip other product types
        }

        return {
          id: product._id.toString(),
          title: product.title,
          slug: product.url_key,
          price,
          discountPrice,
          image,
          stock,
          collections: Array.isArray(product.collections)
            ? product.collections
            : [],
          badgeCollection: product.badgeCollection || null,
        };
      })
      .filter((p) => p !== null) // Remove nulls
      .slice(0, filters.limit); // Limit to requested amount

    const badgeSlugs = [
      ...new Set(
        minimalProducts
          .map((item) => item.badgeCollection)
          .filter((slug) => !!slug)
      ),
    ];
    let badgeMap = new Map();
    if (badgeSlugs.length > 0) {
      const Collection = require("../../models/Collection");
      const docs = await Collection.find({ slug: { $in: badgeSlugs } })
        .select("slug name badgeLabel badgeColor badgeLabelColor")
        .lean();
      badgeMap = new Map(
        docs.map((doc) => [
          doc.slug,
          {
            slug: doc.slug,
            label: doc.badgeLabel || doc.name || doc.slug,
            color: doc.badgeColor || null,
            labelColor: doc.badgeLabelColor || null,
            name: doc.name || null,
          },
        ])
      );
    }

    const withBadges = minimalProducts.map((item) => ({
      ...item,
      badge: item.badgeCollection ? badgeMap.get(item.badgeCollection) || null : null,
    }));

    res.status(200).json(
      ApiResponse.success("Products fetched successfully", {
        data: withBadges,
        total: withBadges.length,
      }).toJSON()
    );
  });
}

module.exports = new CmsProductController();
