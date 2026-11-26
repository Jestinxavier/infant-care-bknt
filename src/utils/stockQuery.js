/**
 * Product-level stock query mirroring the listing's `isInStock` semantics.
 *   inStock=true  → products with sellable stock (any variant, or own stock).
 *   inStock=false → products with none of that (fully out of stock).
 * A CONFIGURABLE product is in stock when any variant has stock; a SIMPLE
 * product when its own stock is positive. `stockObj` (when present) wins over
 * the raw `stock` number, matching product.service.js.
 *
 * Used by the filter counts (getFilters) and the search suggestions, so both
 * hide what the listing hides.
 */
const buildInStockQuery = (inStock) => {
  const inStockConditions = [
    { "variants.stockObj.available": { $gt: 0 } },
    // As in the listing, the isInStock flag only counts when `available` is
    // missing: { available: 0, isInStock: true } is out of stock.
    {
      variants: {
        $elemMatch: {
          "stockObj.isInStock": true,
          "stockObj.available": { $exists: false },
        },
      },
    },
    { $and: [{ "variants.stockObj": { $exists: false } }, { "variants.stock": { $gt: 0 } }] },
    { $and: [{ variants: { $size: 0 } }, { "stockObj.available": { $gt: 0 } }] },
    {
      $and: [
        { variants: { $size: 0 } },
        { "stockObj.isInStock": true },
        { "stockObj.available": { $exists: false } },
      ],
    },
    {
      $and: [
        { variants: { $size: 0 } },
        { stockObj: { $exists: false } },
        { stock: { $gt: 0 } },
      ],
    },
  ];

  return inStock ? { $or: inStockConditions } : { $nor: inStockConditions };
};

module.exports = { buildInStockQuery };
