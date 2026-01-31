const Order = require("../../models/Order");
const Review = require("../../models/Review");
const Product = require("../../models/Product");

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
          select: "name description images category url_key",
        },
      })
      .populate({
        path: "items.productId",
        select: "name description images category url_key",
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
        couponDiscount: order?.coupon?.discountAmount ?? 0,
        productDiscount:
          (order?.discount ?? 0) - (order?.coupon?.discountAmount ?? 0),
      },
      coupon: order?.coupon
        ? {
            code: order.coupon.code,
            discountAmount: order.coupon.discountAmount,
          }
        : null,
      items: await Promise.all(
        order?.items?.map(async (item) => {
          // Check if this item was already reviewed in this order
          const existingReview = await Review.findOne({
            userId,
            orderId: order._id,
            productId: item.productId?._id ?? item.productId,
            variantId: item.variantId,
          });

          // Resolve selectedGift for bundle items (legacy: item has selectedGiftSku but no selectedGift)
          let selectedGift = item?.selectedGift || null;
          if (item?.selectedGiftSku && !selectedGift && !item?.isGift) {
            const giftProduct = await Product.findOne({
              sku: item.selectedGiftSku,
            })
              .select("title name images")
              .lean();
            if (giftProduct) {
              selectedGift = {
                sku: item.selectedGiftSku,
                label: giftProduct.title || giftProduct.name,
                image: giftProduct.images?.[0] || "",
                title: giftProduct.title || giftProduct.name || "",
              };
            }
          }

          // Product URL: variant url when variant, else product url (for /product/[slug])
          const variantUrlKey = item?.variantUrlKey ?? item?.variantId?.url_key;
          const productUrlKey =
            item?.urlKey ?? item?.productId?.url_key ?? item?.productId?.urlKey;
          const productUrl = variantUrlKey || productUrlKey || null;

          return {
            variantId: item?.variantId?._id ?? item?.variantId,
            productId: item?.productId?._id ?? item?.productId,
            productName: item?.variantName ?? item?.name,
            quantity: item?.quantity,
            productImage: item?.variantImage ?? item?.image,
            price: item?.price,
            variantAttributes: item?.variantAttributes,
            productUrl,
            selectedGift,
            isGift: item?.isGift || false,
            isReviewed: !!existingReview,
            review: existingReview
              ? {
                  _id: existingReview._id,
                  rating: existingReview.rating,
                  title: existingReview.title,
                  review: existingReview.review,
                  status: existingReview.status,
                  createdAt: existingReview.createdAt,
                  reply: existingReview.reply,
                  isReplied: existingReview.isReplied,
                  repliedAt: existingReview.repliedAt,
                  isApproved: existingReview.status === "approved",
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
