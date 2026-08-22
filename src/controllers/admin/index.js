const {
  getAllProducts,
  getProductById,
  searchProducts,
  skuLookup,
  countFilterValue,
} = require("./adminProductsController");
const {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
  markCodOrderAsPaid,
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
  countFilterValue,

  // Orders
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
  markCodOrderAsPaid,

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
