const { getAllProducts, getProductById } = require("./adminProductsController");
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
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
  searchProducts,
  skuLookup,

  // Orders
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,

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
