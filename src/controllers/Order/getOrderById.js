const Order = require("../../models/Order");

/**
 * Get single order by ID for the authenticated user
 */
const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID is required. Please authenticate."
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "items.variantId",
        populate: {
          path: "productId",
          select: "name description images category"
        }
      })
      .populate("addressId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Format order for frontend
    const formattedOrder = {
      _id: order._id,
      orderId: order._id.toString(),
      date: order.placedAt || order.createdAt,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      discount: order.discount,
      items: order.items.map(item => ({
        variantId: item.variantId?._id,
        productId: item.variantId?.productId?._id,
        productName: item.variantId?.productId?.name,
        productDescription: item.variantId?.productId?.description,
        productImage: item.variantId?.productId?.images?.[0],
        productCategory: item.variantId?.productId?.category,
        variantColor: item.variantId?.color,
        variantAge: item.variantId?.age,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      address: order.addressId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      order: formattedOrder
    });
  } catch (err) {
    console.error("❌ Error fetching order:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = getOrderById;

