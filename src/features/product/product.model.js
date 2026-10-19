/**
 * Product model — re-export shim.
 *
 * This module used to declare its own `mongoose.model("Product", ...)` while
 * `src/models/Product.js` declared a second one under the same name. Whichever
 * file was imported last won, and the two schemas were not equivalent, so
 * behaviour depended on module load order:
 *
 *   - the schema here has `urlKeyHistory` (needed to 301 retired product URLs)
 *     but is missing `subCategories`, `categoryName`, `name`, `videos`,
 *     `quantityRules` and `averageRating`;
 *   - src/models/Product.js is the reverse.
 *
 * That meant a save through one module could silently strip fields the other
 * declared (Mongoose strict mode drops unknown paths), and re-registering the
 * same name can throw OverwriteModelError depending on import order.
 *
 * `src/models/Product.js` is now the single schema and is a superset of both.
 * This file is kept only so the many `features/product` call sites keep
 * working; new code should import `src/models/Product` directly.
 *
 * Do not reintroduce a schema or a mongoose.model() call here.
 */
const Product = require("../../models/Product");

module.exports = Product;
module.exports.PRODUCT_TYPES = Product.PRODUCT_TYPES;