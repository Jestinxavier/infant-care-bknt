const { getAllProducts, getProductById } = require("./adminProductsController");
const { getAllOrders, getOrderById, updateOrderStatus } = require("./adminOrdersController");
const { getAllCategories, getCategoryById } = require("./adminCategoriesController");

module.exports = {
  // Products
  getAllProducts,
  getProductById,
  
  // Orders
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  
  // Categories
  getAllCategories,
  getCategoryById,
};

