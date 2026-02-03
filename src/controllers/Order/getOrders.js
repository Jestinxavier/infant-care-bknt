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
        message: "User ID is required. Please authenticate.",
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    let query = { userId };

    if (status) {
      switch (status.toLowerCase()) {
        case "pending":
          query.paymentStatus = "pending";
          break;
        case "confirmed":
          query.orderStatus = "processing";
          query.paymentStatus = { $ne: "pending" };
          break;
        case "shipped":
          query.orderStatus = "shipped";
          break;
        case "delivered":
          query.orderStatus = "delivered";
          break;
        case "cancelled":
          query.orderStatus = "cancelled";
          break;
        default:
          break;
      }
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(query)
      .populate({
        path: "items.variantId",
        populate: {
          path: "productId",
          select: "name images",
        },
      })
      .populate({
        path: "items.productId",
        select: "name images",
      })
      .populate("deliveryPartner")
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit);

    // Format orders for frontend
    const formattedOrders = orders.map((order) => {
      return {
        _id: order._id,
        orderId: order.orderId || order._id.toString(),
        date: order.placedAt || order.createdAt,
        status: order.orderStatus,
        payment: {
          status: order.paymentStatus,
          method: order.paymentMethod,
          phonepeTransactionId: order.phonepeTransactionId,
        },
        priceObj: {
          grandTotal: order.totalAmount || order.total,
          subtotal: order.subtotal,
          shippingCost: order.shippingCost,
          discount: order.discount,
        },
        trackingId: order.trackingId,
        deliveryPartner: order.deliveryPartner,
        fulfillmentAdditionalInfo: order.fulfillmentAdditionalInfo,
        items: order.items.map((item) => {
          // Robust product resolution
          const product =
            item.productId && item.productId._id
              ? item.productId
              : item.variantId?.productId;

          return {
            variantId: item.variantId?._id || item.variantId,
            productId: product?._id,
            productName: product?.name || item.name || "Unknown Item",
            productImage: product?.images?.[0] || item.imageUrl,
            quantity: item.quantity,
            price: item.price,
            variantAttributes: item.variantAttributes,
          };
        }),
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        address: order.shippingAddress,
      };
    });

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: formattedOrders,
      total: totalOrders,
      totalPages,
      currentPage: page,
      limit,
    });
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getOrders;
