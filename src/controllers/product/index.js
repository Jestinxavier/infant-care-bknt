const createProduct = require("./createProduct");
const updateProduct = require("./updateProduct");
const { getAllProducts, getProductById, getVariantById } = require("./getProducts");

module.exports = {
  createProduct,
  updateProduct,
  getAllProducts,
  getProductById,
  getVariantById
};
