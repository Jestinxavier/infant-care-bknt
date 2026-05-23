const Notification = require("../../models/Notification");
const logger = require("../../utils/logger");

/**
 * GET /api/admin/notifications
 * Returns all notifications ordered by newest first (both read and unread)
 */
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({ isRead: false });

    res.status(200).json({ success: true, notifications, unreadCount });
  } catch (err) {
    logger.error("❌ Error fetching notifications:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * PATCH /api/admin/notifications/:id/read
 * Mark a single notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.status(200).json({ success: true, notification });
  } catch (err) {
    logger.error("❌ Error marking notification as read:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * PATCH /api/admin/notifications/read-all
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ isRead: false }, { isRead: true, readAt: new Date() });
    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    logger.error("❌ Error marking all notifications as read:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * DELETE /api/admin/notifications/:id
 * Delete a single notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (err) {
    logger.error("❌ Error deleting notification:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * Helper: Create and persist a notification (called internally after order creation)
 */
const createOrderNotification = async ({ orderId, orderDbId, customerName, totalAmount, itemsCount }) => {
  try {
    const notification = new Notification({
      type: "new_order",
      title: `New Order #${orderId}`,
      message: `${customerName} placed an order for ₹${totalAmount} (${itemsCount} item${itemsCount !== 1 ? "s" : ""})`,
      orderId,
      orderDbId: orderDbId || null,
    });
    await notification.save();
    return notification;
  } catch (err) {
    logger.error("❌ Failed to save notification:", err);
    return null;
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createOrderNotification,
};
