/**
 * Get product price and stock by URL key
 *
 * Returns lightweight price and stock data for the exact URL key provided.
 * The URL key can be either a parent product or a variant URL key.
 *
 * Use case: Real-time price/stock checks without loading full product data
 */

const Product = require("../../models/Product");

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

    // Try to find as parent product first
    let product = await Product.findOne({
      url_key: url_key,
      status: "published",
    }).select(
      "url_key pricing stockObj price stock product_type bundle_config",
    );

    if (product) {
      let finalPrice = product.pricing?.price || product.price || 0;
      let finalStock = product.stockObj?.available ?? product.stock ?? 0;

      // Handle Bundle Stock Calculation
      if (
        product.product_type === "BUNDLE" &&
        product.bundle_config?.items?.length > 0
      ) {
        const childSkus = product.bundle_config.items.map((i) => i.sku);
        // We need to fetch child stocks.
        // Since this is a lightweight endpoint, performance matters.
        // Fetch only necessary fields.
        const childProducts = await Product.find({
          sku: { $in: childSkus },
          status: "published",
        }).select("sku stockObj stock");

        const childMap = new Map();
        childProducts.forEach((p) => childMap.set(p.sku, p));

        let minAvailableQty = Infinity;
        let allChildrenInStock = true;

        product.bundle_config.items.forEach((item) => {
          const child = childMap.get(item.sku);
          if (child) {
            const childStock = child.stockObj?.available ?? child.stock ?? 0;
            if (childStock <= 0) allChildrenInStock = false;
            const bundlesAvailable = Math.floor(childStock / (item.qty || 1));
            minAvailableQty = Math.min(minAvailableQty, bundlesAvailable);
          } else {
            allChildrenInStock = false; // Child missing/unpublished
            minAvailableQty = 0;
          }
        });

        if (minAvailableQty === Infinity) minAvailableQty = 0;
        finalStock = minAvailableQty;
      }

      return res.status(200).json({
        success: true,
        url_key: product.url_key,
        price: finalPrice,
        discountPrice:
          product.pricing?.discountPrice || product.offerPrice || null,
        stock: finalStock,
        inStock: finalStock > 0,
        isVariant: false,
      });
    }

    // Try to find as variant url_key
    product = await Product.findOne({
      "variants.url_key": url_key,
      status: "published",
    }).select("variants");

    if (product) {
      const variant = product.variants.find((v) => v.url_key === url_key);
      if (variant) {
        return res.status(200).json({
          success: true,
          url_key: variant.url_key,
          price: variant.pricing?.price || variant.price || 0,
          discountPrice:
            variant.pricing?.discountPrice || variant.discountPrice || null,
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
