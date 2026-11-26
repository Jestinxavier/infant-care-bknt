const mongoose = require("mongoose");
const Product = require("../../models/Product");
const logger = require("../../utils/logger");
const { getActiveOfferPrice, getPricing } = require("../../utils/productPricing");
const { isVariantInStock } = require("../../utils/variantFilterMatch");

const MAX_ITEMS = 20;

const SELECT =
  "title url_key images status product_type price offerPrice offerStartAt offerEndAt pricing stock stockObj " +
  "variants.url_key variants.images variants.price variants.offerPrice variants.offerStartAt variants.offerEndAt " +
  "variants.stock variants.stockObj";

/** Same rule as a variant: stockObj.available wins when present. */
const isProductInStock = (product) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) return variants.some(isVariantInStock);
  return isVariantInStock(product);
};

/**
 * POST /api/v1/product/recently-viewed
 * body: { items: [{ productId, url_key? }] }  (max 20)
 *
 * The storefront's "Recently Viewed" list is a copy saved in the shopper's
 * browser when they open a product, so it goes stale: deleted or unpublished
 * products stay in it (tapping one opens a "not found" page), prices keep
 * their old values, and sold-out items look available. This returns the
 * current details for each one that is still published — in the order sent —
 * and simply leaves out the rest, so the list can drop them.
 *
 * `url_key` is the variant the shopper viewed: when it still exists, its own
 * price, stock and image are returned; otherwise the product's.
 */
const getRecentlyViewed = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_ITEMS) : [];
    const requested = raw
      .map((item) => ({
        productId: String(item?.productId || ""),
        urlKey: typeof item?.url_key === "string" ? item.url_key : "",
      }))
      .filter((item) => mongoose.Types.ObjectId.isValid(item.productId));

    if (requested.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    const docs = await Product.find({
      _id: { $in: requested.map((item) => item.productId) },
      status: "published",
    })
      .select(SELECT)
      .lean();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));

    const items = [];
    for (const { productId, urlKey } of requested) {
      const product = byId.get(productId);
      if (!product) continue; // deleted or unpublished → drop from the list

      const variant = urlKey
        ? (product.variants || []).find((v) => v.url_key === urlKey)
        : null;

      let regularPrice;
      let offerPrice;
      let inStock;
      if (variant) {
        regularPrice = variant.price || 0;
        const offer = getActiveOfferPrice(
          variant.offerPrice,
          variant.offerStartAt,
          variant.offerEndAt
        );
        offerPrice = offer > 0 && offer < regularPrice ? offer : null;
        inStock = isVariantInStock(variant);
      } else {
        const pricing = getPricing(product);
        regularPrice = pricing.regular_price;
        offerPrice = pricing.offer_price;
        inStock = isProductInStock(product);
      }

      items.push({
        productId,
        // A variant that was deleted falls back to the product's own page.
        url_key: variant?.url_key || product.url_key,
        title: product.title,
        image: variant?.images?.[0] || product.images?.[0] || "",
        regularPrice,
        discountPrice: offerPrice,
        inStock,
      });
    }

    return res.status(200).json({ success: true, items });
  } catch (error) {
    logger.error("❌ Recently viewed lookup failed:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = getRecentlyViewed;
