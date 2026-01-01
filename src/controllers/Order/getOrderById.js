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
      trackingId: order.trackingId,
      deliveryNote: order.deliveryNote,
      deliveryPartner: order.deliveryPartner,
      fulfillmentAdditionalInfo: order.fulfillmentAdditionalInfo,
      statusHistory: order.statusHistory,
      totalQuantity: order?.totalQuantity,
      payment: { status: order?.paymentStatus, method: order?.paymentMethod },
      priceObj: {
        grandTotal: order?.totalAmount,
        subtotal: order?.subtotal,
        shippingCost: order?.shippingCost,
        discount: order?.discount,
      },
      items: await Promise.all(
        order?.items?.map(async (item) => {
          // Check if this item was already reviewed in this order
          const existingReview = await Review.findOne({
            userId,
            orderId: order._id,
            productId: item.productId?._id,
            variantId: item.variantId,
          });

          return {
            variantId: item?.variantId,
            productId: item?.productId?._id,
            productName: item?.variantName ?? item?.name,
            quantity: item?.quantity,
            productImage: item?.variantImage ?? item?.image,
            price: item?.price,
            variantAttributes: item?.variantAttributes,
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
      itemCount: order.items.reduce((sum, item) => sum + item?.quantity, 0),
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
