const createProduct = require("./createProduct");
const updateProduct = require("./updateProduct");
const deleteProduct = require("./deleteProduct");
const { getAllProducts, getProductById, getProductByUrlKey, getVariantById, getSearchIndex } = require("./getProducts");

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById,
  getSearchIndex
};
