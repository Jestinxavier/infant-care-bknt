const Product = require("../models/Product");

/**
 * Products and variants created before `stockObj.available` existed may only
 * have the legacy `stock` field (or `stockObj.available: null`). Everything
 * that displays or checks stock reads `stockObj.available ?? stock`, but
 * stock is taken with `$inc` on `stockObj.available`, which on a missing field
 * creates it as -qty (the product then looks sold out forever) and on null
 * throws.
 *
 * Call this right before taking stock: it copies the legacy count into
 * `stockObj.available` wherever that is missing, so the decrement can match on
 * `stockObj.available >= qty` alone and do correct arithmetic. Records that
 * already have a number are never touched (the filters re-check it, so a
 * concurrent sale is never overwritten).
 *
 * @param {Array<{productId?, variantId?, sku?}>} targets - lines about to be
 *   decremented; `sku` targets resolve to a SIMPLE product's root sku or a
 *   variant's sku (bundle children)
 * @param {ClientSession} [session]
 */
const hasNumber = (stockObj) => typeof stockObj?.available === "number";
const legacyCount = (source) => Math.max(0, Number(source?.stock) || 0);

async function backfillLegacyStock(targets, session = null) {
  const productIds = [...new Set(targets.filter((t) => t.productId).map((t) => String(t.productId)))];
  const skus = [...new Set(targets.filter((t) => t.sku).map((t) => t.sku))];
  if (productIds.length === 0 && skus.length === 0) return;

  const or = [];
  if (productIds.length) or.push({ _id: { $in: productIds } });
  if (skus.length) or.push({ sku: { $in: skus } }, { "variants.sku": { $in: skus } });

  const query = Product.find({ $or: or })
    .select("sku stock stockObj variants.id variants.sku variants.stock variants.stockObj")
    .lean();
  if (session) query.session(session);
  const docs = await query;

  const ops = [];
  const fixProduct = (doc) => {
    if (hasNumber(doc.stockObj)) return;
    const available = legacyCount(doc);
    ops.push({
      updateOne: doc.stockObj && typeof doc.stockObj === "object"
        ? {
            filter: { _id: doc._id, "stockObj.available": { $not: { $type: "number" } } },
            update: { $set: { "stockObj.available": available } },
          }
        : {
            filter: { _id: doc._id, stockObj: null },
            update: { $set: { stockObj: { available, isInStock: available > 0 } } },
          },
    });
  };
  const fixVariant = (doc, variant) => {
    if (hasNumber(variant.stockObj)) return;
    const available = legacyCount(variant);
    const hasObj = variant.stockObj && typeof variant.stockObj === "object";
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: hasObj
          ? { $set: { "variants.$[v].stockObj.available": available } }
          : { $set: { "variants.$[v].stockObj": { available, isInStock: available > 0 } } },
        arrayFilters: [
          hasObj
            ? { "v.id": variant.id, "v.stockObj.available": { $not: { $type: "number" } } }
            : { "v.id": variant.id, "v.stockObj": null },
        ],
      },
    });
  };

  for (const doc of docs) {
    for (const target of targets) {
      if (target.productId && String(target.productId) === String(doc._id)) {
        if (target.variantId) {
          const variant = doc.variants?.find((v) => v.id === target.variantId);
          if (variant) fixVariant(doc, variant);
        } else {
          fixProduct(doc);
        }
      } else if (target.sku) {
        if (doc.sku === target.sku) fixProduct(doc);
        const variant = doc.variants?.find((v) => v.sku === target.sku);
        if (variant) fixVariant(doc, variant);
      }
    }
  }

  if (ops.length === 0) return;
  await Product.bulkWrite(ops, { ordered: false, ...(session && { session }) });
}

module.exports = { backfillLegacyStock };
