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
      .populate({
        path: "items.productId",
        select: "name description images category"
      })
      .populate("addressId")
      .populate("deliveryPartner");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Format order for frontend
    const formattedOrder = {
      _id: order._id,
      orderId: order.orderId || order._id.toString(),
      date: order.placedAt || order.createdAt,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      discount: order.discount,
      trackingId: order.trackingId,
      deliveryNote: order.deliveryNote,
      deliveryPartner: order.deliveryPartner,
      fulfillmentAdditionalInfo: order.fulfillmentAdditionalInfo,
      statusHistory: order.statusHistory,
      items: order.items.map(item => {
        // robust product resolution
        const product = (item.productId && item.productId._id) ? item.productId : (item.variantId?.productId);

        return {
          variantId: item.variantId?._id || item.variantId, // handle if string or object
          productId: product?._id,
          productName: product?.name || item.name || "Unknown Item",
          productDescription: product?.description,
          productImage: product?.images?.[0] || item.imageUrl,
          productCategory: product?.category,
          variantColor: item.variantId?.color, // assuming populated variant has color directly or in options? Model says variantId is String ref? No, Schema says String default null.
          // Wait, the Schema says variantId is Type: String. But the populate above tries to populate it? 
          // If variantId is a String pointing to a Variant SUBDOCUMENT in a Product, it cannot be populated by mongoose directly unless it's an ObjectId ref to a separate collection.
          // In the Product model, variants are embedded. 
          // The previous code tried to populate 'items.variantId'. If 'variantId' is just a string code, this fails.
          // However, let's look at the admin controller fix. 
          // The admin controller had: populating 'items.variantId' (REMOVED) and 'items.productId' (ADDED).
          // So I should essentially do the same here: depend on items.productId.

          variantColor: item.variantColor, // if saved on item
          variantAge: item.variantAge, // if saved on item
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        };
      }),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      address: order.shippingAddress || order.addressId,
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

