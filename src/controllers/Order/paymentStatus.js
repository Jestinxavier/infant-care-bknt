const Order = require("../../models/Order");

const getPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findOne(
      { orderId: req.params.orderId },
      { paymentStatus: 1, orderStatus: 1, orderId: 1, _id: 0 },
    ).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    return res.json({ success: true, paymentStatus: order.paymentStatus, orderStatus: order.orderStatus });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = getPaymentStatus;
