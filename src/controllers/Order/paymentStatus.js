const Order = require("../../models/Order");

const getPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findOne(
      { orderId: req.params.orderId },
      {
        paymentStatus: 1,
        orderStatus: 1,
        orderId: 1,
        totalAmount: 1,
        totalQuantity: 1,
        items: 1,
        _id: 0,
      },
    ).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const items = (order.items || []).map((item) => ({
      // variantSku is the SKU the shopper selected; item.sku is the parent SKU.
      sku: item.variantSku || item.sku || String(item.productId || ""),
      variantSku: item.variantSku || null,
      name: item.name || "Product",
      price: item.price || 0,
      quantity: item.quantity || 1,
    }));

    return res.json({
      success: true,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      totalAmount: order.totalAmount,
      totalQuantity: order.totalQuantity,
      items,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = getPaymentStatus;
