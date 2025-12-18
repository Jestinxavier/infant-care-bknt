const { getAllProducts, getProductById } = require("./adminProductsController");
const { getAllOrders, getOrderById, updateOrderStatus } = require("./adminOrdersController");
const { getAllCategories, getCategoryById } = require("./adminCategoriesController");
const { getAllCustomers } = require("./adminCustomersController");
const { getAllReviews, replyToReview } = require("./adminReviewController");

module.exports = {
  // Products
  getAllProducts,
  getProductById,

  // Orders
  getAllOrders,
  getOrderById,
  updateOrderStatus,

  // Customers
  getAllCustomers,

  // Categories
  getAllCategories,
  getCategoryById,

  // Reviews
  getAllReviews,
  replyToReview,
};

