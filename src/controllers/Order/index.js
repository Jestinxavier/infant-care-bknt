const createOrder = require("./orderController");
const getOrders = require("./getOrders");
const getOrderById = require("./getOrderById");

const getPaymentStatus = require("./paymentStatus");

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  getPaymentStatus,
};


