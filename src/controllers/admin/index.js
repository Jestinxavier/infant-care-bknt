const {
  getAllProducts,
  getProductById,
  searchProducts,
  skuLookup,
  countFilterValue,
  getDesignFamilies,
} = require("./adminProductsController");
const { reindexSearchIndex } = require("./adminSearchController");
const {
  getAllOrders,
  getOrderStatusCounts,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
  markCodOrderAsPaid,
  exportOrders,
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
  getDesignFamilies,
  reindexSearchIndex,

  // Orders
  getAllOrders,
  getOrderStatusCounts,
  getOrderById,
  updateOrderStatus,
  sendOrderInvoice,
  markOrderAsPaid,
  markCodOrderAsPaid,
  exportOrders,

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
