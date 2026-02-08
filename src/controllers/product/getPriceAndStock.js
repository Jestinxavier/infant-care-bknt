/**
 * Get product price and stock by URL key
 *
 * Returns lightweight price and stock data for the exact URL key provided.
 * The URL key can be either a parent product or a variant URL key.
 * Uses resolvePrice() so offer price is only returned when offer is active (within dates).
 *
 * Use case: Real-time price/stock checks without loading full product data
 */

const Product = require("../../models/Product");
const { resolvePrice } = require("../../utils/pricingUtils");

const getPriceAndStock = async (req, res) => {
  try {
    const url_key = req.params.url_key || req.query.url_key;

    // Validate url_key
    if (!url_key || url_key === "undefined" || url_key === "null") {
      return res.status(400).json({
        success: false,
        message: "Product url_key is required",
      });
    }

    // Try to find as parent product first (include offer fields for resolvePrice)
    let product = await Product.findOne({
      url_key: url_key,
      status: "published",
    }).select(
      "url_key pricing stockObj price stock product_type bundle_config offerPrice offerStartAt offerEndAt"
    );

    if (product) {
      const resolved = resolvePrice({
        price: product.pricing?.price ?? product.price ?? 0,
        offerPrice: product.offerPrice,
        offerStartAt: product.offerStartAt,
        offerEndAt: product.offerEndAt,
      });
      let finalStock = product.stockObj?.available ?? product.stock ?? 0;

      // Handle Bundle Stock Calculation
      if (
        product.product_type === "BUNDLE" &&
        product.bundle_config?.items?.length > 0
      ) {
        const childSkus = product.bundle_config.items.map((i) => i.sku);
        const childMap = new Map(); // sku -> stock number

        // SIMPLE products (root sku)
        const simpleProducts = await Product.find({
          sku: { $in: childSkus },
          product_type: "SIMPLE",
          status: "published",
        }).select("sku stockObj stock");
        simpleProducts.forEach((p) => {
          childMap.set(p.sku, p.stockObj?.available ?? p.stock ?? 0);
        });

        // Variant SKUs (CONFIGURABLE)
        const missingSkus = childSkus.filter((s) => !childMap.has(s));
        if (missingSkus.length > 0) {
          const variantProducts = await Product.find({
            "variants.sku": { $in: missingSkus },
            status: "published",
          }).select("variants.sku variants.stockObj variants.stock");
          variantProducts.forEach((p) => {
            (p.variants || []).forEach((v) => {
              if (missingSkus.includes(v.sku)) {
                childMap.set(v.sku, v.stockObj?.available ?? v.stock ?? 0);
              }
            });
          });
        }

        let minAvailableQty = Infinity;
        let allChildrenInStock = true;

        product.bundle_config.items.forEach((item) => {
          const childStock = childMap.get(item.sku);
          if (childStock !== undefined) {
            if (childStock <= 0) allChildrenInStock = false;
            const bundlesAvailable = Math.floor(childStock / (item.qty || 1));
            minAvailableQty = Math.min(minAvailableQty, bundlesAvailable);
          } else {
            allChildrenInStock = false;
            minAvailableQty = 0;
          }
        });

        if (minAvailableQty === Infinity) minAvailableQty = 0;
        finalStock = minAvailableQty;
      }

      return res.status(200).json({
        success: true,
        url_key: product.url_key,
        price: resolved.price,
        discountPrice: resolved.discountPrice ?? null,
        stock: finalStock,
        inStock: finalStock > 0,
        isVariant: false,
      });
    }

    // Try to find as variant url_key (variants include offerPrice, offerStartAt, offerEndAt)
    product = await Product.findOne({
      "variants.url_key": url_key,
      status: "published",
    }).select("variants");

    if (product) {
      const variant = product.variants.find((v) => v.url_key === url_key);
      if (variant) {
        const variantResolved = resolvePrice({
          price: variant.pricing?.price ?? variant.price ?? 0,
          offerPrice: variant.offerPrice,
          offerStartAt: variant.offerStartAt,
          offerEndAt: variant.offerEndAt,
        });
        return res.status(200).json({
          success: true,
          url_key: variant.url_key,
          price: variantResolved.price,
          discountPrice: variantResolved.discountPrice ?? null,
          stock: variant.stockObj?.available ?? variant.stock ?? 0,
          inStock: (variant.stockObj?.available ?? variant.stock ?? 0) > 0,
          isVariant: true,
          variantId: variant.id,
        });
      }
    }

    // Not found
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  } catch (err) {
    console.error("❌ Error fetching price/stock:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = { getPriceAndStock };
