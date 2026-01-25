const { getAllProducts, getProductById } = require("./adminProductsController");
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
} = require("./adminOrdersController");
const {
  getAllCategories,
  getCategoryById,
} = require("./adminCategoriesController");
const {
  getAllCustomers,
  getCustomerById,
} = require("./adminCustomersController");
const {
  getAllReviews,
  replyToReview,
  approveReview,
  rejectReview,
} = require("./adminReviewController");

module.exports = {
  // Products
  getAllProducts,
  getProductById,

  // Orders
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,

  // Customers
  getAllCustomers,
  getCustomerById,

  // Categories
  getAllCategories,
  getCategoryById,

  // Reviews
  getAllReviews,
  replyToReview,
  approveReview,
  rejectReview,
};
