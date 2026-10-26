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

  // Products whose type we must know before we can decide the restore target:
  // line items that are neither gift nor variant-backed. Batch-load them in a
  // single query up front so the per-item loop never awaits.
  const needsLookup = order.items.filter(
    (item) => !item.isGift && !item.variantId && item.productId
  );
  const lookupIds = [...new Set(needsLookup.map((item) => String(item.productId)))];

  const productById = new Map();
  if (lookupIds.length > 0) {
    const docs = await Product.find({ _id: { $in: lookupIds } })
      .select("product_type bundle_config")
      .lean();
    for (const doc of docs) {
      productById.set(String(doc._id), doc);
    }
  }

  // Build every stock increment up front, then flush with one bulkWrite.
  const operations = [];

  for (const item of order.items) {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;

    // 1. Gift items: restore to simple product (gift product)
    if (item.isGift) {
      operations.push({
        updateOne: {
          filter: { _id: item.productId },
          update: {
            $inc: {
              "stockObj.available": quantity,
              stock: quantity,
            },
          },
        },
      });
      continue;
    }

    // 2. Variant products: restore to specific variant
    if (item.variantId) {
      operations.push({
        updateOne: {
          filter: { _id: item.productId, "variants.id": item.variantId },
          update: {
            $inc: {
              "variants.$.stockObj.available": quantity,
              "variants.$.stock": quantity,
            },
          },
        },
      });
      continue;
    }

    // 3. Bundle or Simple/Configurable: type resolved from the batch lookup
    const product = item.productId
      ? productById.get(String(item.productId))
      : null;

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
      for (const child of product.bundle_config.items) {
        const restoreQty = (child.qty || 1) * quantity;
        if (restoreQty <= 0) continue;

        operations.push({
          updateOne: {
            filter: {
              sku: child.sku,
              product_type: PRODUCT_TYPES.SIMPLE,
            },
            update: {
              $inc: {
                "stockObj.available": restoreQty,
                stock: restoreQty,
              },
            },
          },
        });
      }
    } else {
      // Simple or Configurable: restore to product
      operations.push({
        updateOne: {
          filter: { _id: item.productId },
          update: {
            $inc: {
              "stockObj.available": quantity,
              stock: quantity,
            },
          },
        },
      });
    }
  }

  if (operations.length === 0) return;

  try {
    await Product.bulkWrite(operations, { ordered: true });
  } catch (err) {
    console.error(
      `[orderStockRestore] Failed to restore stock (order ${order.orderId}):`,
      err.message
    );
    throw err;
  }
}

module.exports = { restoreOrderStock };
