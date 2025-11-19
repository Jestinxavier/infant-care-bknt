const createCategory = require("./createCategory");
const { getAllCategories, getCategoryById } = require("./getCategories");
const updateCategory = require("./updateCategory");
const deleteCategory = require("./deleteCategory");

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
};

