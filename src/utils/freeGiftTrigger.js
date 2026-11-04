const Product = require("../models/Product");
const Category = require("../models/Category");

const isCategoryTrigger = (fg) => fg?.triggerType === "category";

/** True when the free-gift config names at least one trigger product/category. */
const hasTrigger = (fg) =>
  isCategoryTrigger(fg)
    ? (fg.triggerCategoryIds?.length ?? 0) > 0
    : (fg?.triggerProductIds?.length ?? 0) > 0;

/** Mongo filter matching products whose main category or sub-categories hit the trigger. */
const categoryTriggerFilter = (categoryIds) => ({
  $or: [
    { category: { $in: categoryIds } },
    { subCategories: { $in: categoryIds } },
  ],
});

/**
 * Total quantity of qualifying (non-gift) items in the cart for a free-gift coupon.
 * Category triggers resolve cart products against the DB, so this works whether
 * or not `items.productId` is populated.
 */
const countTriggerQty = async (fg, cartItems) => {
  const paidItems = (cartItems || []).filter((item) => !item.isFreeGiftCoupon);
  const productIdOf = (item) => (item.productId?._id || item.productId)?.toString();

  let triggerIds;
  if (isCategoryTrigger(fg)) {
    const cartProductIds = [...new Set(paidItems.map(productIdOf).filter(Boolean))];
    if (!cartProductIds.length) return 0;
    const matched = await Product.find(
      { _id: { $in: cartProductIds }, ...categoryTriggerFilter(fg.triggerCategoryIds) },
      "_id",
    ).lean();
    triggerIds = new Set(matched.map((p) => p._id.toString()));
  } else {
    triggerIds = new Set((fg?.triggerProductIds || []).map((id) => (id._id || id).toString()));
  }

  return paidItems.reduce((sum, item) => {
    const pid = productIdOf(item);
    return pid && triggerIds.has(pid) ? sum + item.quantity : sum;
  }, 0);
};

/** Human-readable trigger names for "Add at least N of …" messages. */
const describeTrigger = async (fg) => {
  if (isCategoryTrigger(fg)) {
    const cats = await Category.find({ _id: { $in: fg.triggerCategoryIds } }, "name").lean();
    return `products from ${cats.map((c) => c.name).join(", ")}`;
  }
  const products = await Product.find({ _id: { $in: fg.triggerProductIds } }, "title").lean();
  return products.map((p) => p.title).join(", ");
};

module.exports = {
  isCategoryTrigger,
  hasTrigger,
  categoryTriggerFilter,
  countTriggerQty,
  describeTrigger,
};
