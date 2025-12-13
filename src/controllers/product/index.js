const createProduct = require("./createProduct");
const updateProduct = require("./updateProduct");
const deleteProduct = require("./deleteProduct");
const bulkDeleteProducts = require("./bulkDeleteProducts");
const { getAllProducts, getProductById, getProductByUrlKey, getVariantById } = require("./getProducts");

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getAllProducts,
  getProductById,
  getProductByUrlKey,
  getVariantById
};
