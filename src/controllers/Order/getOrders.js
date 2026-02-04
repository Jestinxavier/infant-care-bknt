const Order = require("../../models/Order");

/**
 * Get all orders for the authenticated user (list view – minimal fields only).
 * Full order details (payment, items, address, tracking, etc.) are from GET /orders/:orderId.
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
    const rawStatus = req.query.status;
    const status = rawStatus
      ? String(Array.isArray(rawStatus) ? rawStatus[0] : rawStatus)
          .trim()
          .toLowerCase()
      : "";
    const skip = (page - 1) * limit;

    let query = { userId };

    if (status) {
      switch (status) {
        case "pending":
          query.paymentStatus = "pending";
          break;
        case "confirmed":
          // Paid orders that are confirmed/processing, or paid but still pending (e.g. status not yet updated)
          query.$or = [
            { orderStatus: { $in: ["confirmed", "processing"] } },
            { paymentStatus: "paid", orderStatus: "pending" },
          ];
          break;
        case "processing":
          query.orderStatus = "processing";
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

    // List only: no populate needed
    const orders = await Order.find(query)
      .select(
        "_id orderId placedAt createdAt orderStatus totalAmount total items"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      orderId: order.orderId || order._id.toString(),
      date: order.placedAt || order.createdAt,
      status: order.orderStatus,
      priceObj: {
        grandTotal: order.totalAmount ?? order.total ?? 0,
      },
      itemCount: order.items.reduce(
        (sum, item) => sum + (item.quantity || 0),
        0
      ),
    }));

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
