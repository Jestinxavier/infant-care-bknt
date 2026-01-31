/**
 * Order Stock Restore Utility
 *
 * Restores product stock when an order is cancelled.
 * Handles: Simple products, Variants, Bundle products (child SKUs), and Gift items.
 *
 * Bundle logic: For each bundle item ordered with quantity Q, restores
 * (child.qty * Q) to each child product by SKU, matching order creation deductions.
 */

const Product = require("../models/Product");
const { PRODUCT_TYPES } = require("../features/product/product.model");

/**
 * Restore stock for all items in a cancelled order
 * @param {Object} order - Order document with items array
 * @returns {Promise<void>}
 */
async function restoreOrderStock(order) {
  if (!order || !order.items || order.items.length === 0) {
    return;
  }

  for (const item of order.items) {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;

    try {
      // 1. Gift items: restore to simple product (gift product)
      if (item.isGift) {
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: {
              "stockObj.available": quantity,
              stock: quantity,
            },
          }
        );
        continue;
      }

      // 2. Variant products: restore to specific variant
      if (item.variantId) {
        await Product.updateOne(
          { _id: item.productId, "variants.id": item.variantId },
          {
            $inc: {
              "variants.$.stockObj.available": quantity,
              "variants.$.stock": quantity,
            },
          }
        );
        continue;
      }

      // 3. Bundle or Simple/Configurable: fetch product to determine type
      const product = await Product.findById(item.productId)
        .select("product_type bundle_config")
        .lean();

      if (!product) {
        console.warn(
          `[orderStockRestore] Product ${item.productId} not found for order ${order.orderId}`
        );
        continue;
      }

      if (
        product.product_type === PRODUCT_TYPES.BUNDLE &&
        product.bundle_config?.items?.length > 0
      ) {
        // Bundle: restore to each child SKU (child.qty * orderQuantity)
        const bundleConfig = product.bundle_config;
        for (const child of bundleConfig.items) {
          const restoreQty = (child.qty || 1) * quantity;
          if (restoreQty <= 0) continue;

          await Product.findOneAndUpdate(
            {
              sku: child.sku,
              product_type: PRODUCT_TYPES.SIMPLE,
            },
            {
              $inc: {
                "stockObj.available": restoreQty,
                stock: restoreQty,
              },
            }
          );
        }
      } else {
        // Simple or Configurable: restore to product
        await Product.updateOne(
          { _id: item.productId },
          {
            $inc: {
              "stockObj.available": quantity,
              stock: quantity,
            },
          }
        );
      }
    } catch (err) {
      console.error(
        `[orderStockRestore] Failed to restore stock for item ${item.productId} (order ${order.orderId}):`,
        err.message
      );
      throw err;
    }
  }
}

module.exports = { restoreOrderStock };
