const {
  getAllProducts,
  getProductById,
  searchProducts,
  skuLookup,
  countFilterValue,
} = require("./adminProductsController");
const { reindexSearchIndex } = require("./adminSearchController");
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
  reindexSearchIndex,

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
