const Product = require("../../models/Product");

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

        for (const item of items) {
            const { productId, variantId, quantity } = item;

            const product = await Product.findById(productId);
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
        console.error("❌ Error checking stock:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

module.exports = checkStock;
