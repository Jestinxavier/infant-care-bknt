const createProduct = require("./createProduct");
const updateProduct = require("./updateProduct");
const deleteProduct = require("./deleteProduct");
const bulkDeleteProducts = require("./bulkDeleteProducts");
const {
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex,
} = require("./getProducts");
const checkStock = require("./checkStock");
const { getPriceAndStock } = require("./getPriceAndStock");

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex,
  checkStock,
  getPriceAndStock,
};
