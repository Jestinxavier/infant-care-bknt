const Order = require("../../models/Order");

/**
 * Get all orders for the authenticated user
 */
const getOrders = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID is required. Please authenticate."
      });
    }

    const orders = await Order.find({ userId })
      .populate({
        path: "items.variantId",
        populate: {
          path: "productId",
          select: "name images"
        }
      })
      .populate({
        path: "items.productId",
        select: "name images"
      })
      .populate("addressId", "fullName phone houseName street landmark city state pincode country nickname")
      .sort({ createdAt: -1 }); // Most recent first

    // Format orders for frontend
    const formattedOrders = orders.map(order => {
      return {
        _id: order._id,
        orderId: order.orderId || order._id.toString(),
        date: order.placedAt || order.createdAt,
        status: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount || order.total,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        discount: order.discount,
        fulfillmentAdditionalInfo: order.fulfillmentAdditionalInfo,
        items: order.items.map(item => {
          // Robust product resolution
          const product = (item.productId && item.productId._id) ? item.productId : (item.variantId?.productId);

          return {
            variantId: item.variantId?._id || item.variantId,
            productId: product?._id,
            productName: product?.name || item.name || "Unknown Item",
            productImage: product?.images?.[0] || item.imageUrl,
            quantity: item.quantity,
            price: item.price,
          };
        }),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        address: order.addressId,
      };
    });

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: formattedOrders,
      total: formattedOrders.length
    });
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message
    });
  }
};

module.exports = getOrders;

