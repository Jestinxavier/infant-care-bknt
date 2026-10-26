const Product = require("../../models/Product");
const logger = require("../../utils/logger");

/**
 * Check stock availability for multiple items
 * POST /api/v1/product/check-stock
 */
const checkStock = async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Items array is required",
            });
        }

        const results = [];
        let allAvailable = true;

        // Batch-fetch every referenced product in one query instead of a
        // findById per line item (the N+1 the endpoint used to do).
        const productIds = [
          ...new Set(
            items
              .map((item) => item.productId)
              .filter(Boolean)
              .map((id) => String(id))
          ),
        ];
        const products = productIds.length
          ? await Product.find({ _id: { $in: productIds } }).lean()
          : [];
        const productById = new Map(
          products.map((p) => [String(p._id), p])
        );

        for (const item of items) {
            const { productId, variantId, quantity } = item;

            const product = productId ? productById.get(String(productId)) : null;
            if (!product) {
                results.push({
                    productId,
                    variantId,
                    available: false,
                    reason: "Product not found",
                });
                allAvailable = false;
                continue;
            }

            let stock = 0;
            let itemName = product.name || product.title;

            if (variantId) {
                const variantData = product.variants?.find(
                    (v) => v.id === variantId || v._id?.toString() === variantId
                );

                if (!variantData) {
                    results.push({
                        productId,
                        variantId,
                        available: false,
                        reason: "Variant not found",
                    });
                    allAvailable = false;
                    continue;
                }
                stock = variantData.stockObj?.available ?? variantData.stock ?? 0;
                if (variantData.color || variantData.age) {
                    itemName += ` (${variantData.color || ""} ${variantData.age || ""})`.trim();
                }
            } else {
                stock = product.stockObj?.available ?? product.stock ?? 0;
            }

            if (stock < quantity) {
                results.push({
                    productId,
                    variantId,
                    itemName,
                    requested: quantity,
                    available: false,
                    currentStock: stock,
                    reason: "Insufficient stock",
                });
                allAvailable = false;
            } else {
                results.push({
                    productId,
                    variantId,
                    itemName,
                    requested: quantity,
                    available: true,
                    currentStock: stock,
                });
            }
        }

        res.status(200).json({
            success: true,
            allAvailable,
            results,
        });
    } catch (error) {
        logger.error("❌ Error checking stock:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
                    });
    }
};

module.exports = checkStock;
