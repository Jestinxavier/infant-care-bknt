const Order = require("../../models/Order");
const Review = require("../../models/Review");

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
        message: "User ID is required. Please authenticate.",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const mongoose = require("mongoose");

    let query = { userId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.$or = [{ _id: orderId }, { orderId: orderId }];
    } else {
      query.orderId = orderId;
    }

    const order = await Order.findOne(query)
      .populate({
        path: "items.variantId",
        populate: {
          path: "productId",
          select: "name description images category",
        },
      })
      .populate({
        path: "items.productId",
        select: "name description images category",
      })
      .populate("addressId")
      .populate("deliveryPartner");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
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
      items: await Promise.all(
        order.items.map(async (item) => {
          // robust product resolution
          const product =
            item.productId && item.productId._id
              ? item.productId
              : item.variantId?.productId;

          // Check if this item was already reviewed in this order
          const existingReview = await Review.findOne({
            userId,
            orderId,
            productId: product?._id,
            variantId: item.variantId?._id || item.variantId,
          });

          return {
            variantId: item.variantId?._id || item.variantId,
            productId: product?._id,
            productName: product?.name || item.name || "Unknown Item",
            productDescription: product?.description,
            productImage: product?.images?.[0] || item.imageUrl,
            productCategory: product?.category,
            variantColor: item.variantColor,
            variantAge: item.variantAge,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            isReviewed: !!existingReview,
            review: existingReview
              ? {
                  rating: existingReview.rating,
                  review: existingReview.review,
                  createdAt: existingReview.createdAt,
                  reply: existingReview.reply,
                  isReplied: existingReview.isReplied,
                  repliedAt: existingReview.repliedAt,
                }
              : null,
          };
        })
      ),
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      address: order.shippingAddress || order.addressId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      order: formattedOrder,
    });
  } catch (err) {
    console.error("❌ Error fetching order:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

module.exports = getOrderById;
