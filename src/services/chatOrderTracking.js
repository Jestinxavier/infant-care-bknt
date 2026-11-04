const Order = require("../models/Order");

/**
 * Order tracking for the Infanta AI chat bot.
 *
 * A customer gets an order's status only when the order number AND a contact
 * detail on that order match (the email or phone used at checkout or on their
 * account) — or when they're signed in as the order's owner. A failed lookup
 * never says whether the order exists, so order numbers can't be probed.
 */

// Order numbers are 8 hex characters (see generateOrderId), often written "#AE698036".
const ORDER_ID_RE = /#?\b([a-f0-9]{8})\b/i;

const normalizeOrderId = (value) => {
  const match = String(value || "").trim().match(ORDER_ID_RE);
  return match ? match[1].toUpperCase() : null;
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const last10Digits = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

/** Pull an email / phone the customer typed into the message, if any. */
const extractContacts = (text) => {
  const s = String(text || "");
  const email = s.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  // A phone is 10+ digits possibly split by spaces/dashes; drop the order id
  // first so its digits aren't read as part of a phone number.
  const withoutOrderId = s.replace(ORDER_ID_RE, " ");
  const phoneMatch = withoutOrderId.match(/(?:\+?\d[\d\s-]{8,}\d)/);
  const phone = phoneMatch ? last10Digits(phoneMatch[0]) : null;
  return { email, phone };
};

const contactMatches = (order, { emails, phones }) => {
  const orderEmails = [order.guestInfo?.email, order.userId?.email]
    .filter(Boolean)
    .map((e) => String(e).trim().toLowerCase());
  const orderPhones = [
    order.guestInfo?.phone,
    order.shippingAddress?.phone,
    order.userId?.phone,
  ]
    .map(last10Digits)
    .filter(Boolean);
  return (
    emails.some((e) => orderEmails.includes(e)) ||
    phones.some((p) => orderPhones.includes(p))
  );
};

/**
 * @param {{ orderId: string, emails?: string[], phones?: string[], userId?: string|null }} q
 * @returns {Promise<object|null>} the order when verified, otherwise null
 */
const findVerifiedOrder = async ({ orderId, emails = [], phones = [], userId = null }) => {
  const id = normalizeOrderId(orderId);
  if (!id) return null;
  const order = await Order.findOne({ orderId: id })
    .populate("userId", "email phone")
    .populate("deliveryPartner", "name trackingUrlTemplate")
    .lean();
  if (!order) return null;

  const ownerId = order.userId?._id ? String(order.userId._id) : null;
  if (userId && ownerId && String(userId) === ownerId) return order;

  const cleanEmails = emails.filter(Boolean).map((e) => String(e).trim().toLowerCase());
  const cleanPhones = phones.map(last10Digits).filter(Boolean);
  if (cleanEmails.length === 0 && cleanPhones.length === 0) return null;
  return contactMatches(order, { emails: cleanEmails, phones: cleanPhones }) ? order : null;
};

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : null;

const statusDate = (order, status) => {
  const entry = [...(order.statusHistory || [])]
    .reverse()
    .find((h) => h.status === status);
  return formatDate(entry?.timestamp);
};

const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Plain-text status reply. Built from the order itself, never by the AI. */
const describeOrder = (order, { siteUrl = "" } = {}) => {
  const id = `#${order.orderId}`;
  const items = (order.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
  const summary = `${items} item${items === 1 ? "" : "s"} · ${rupees(order.totalAmount)} · placed ${formatDate(order.placedAt || order.createdAt)}`;
  const partner = order.deliveryPartner?.name;
  const trackingUrl =
    order.trackingId && order.deliveryPartner?.trackingUrlTemplate
      ? order.deliveryPartner.trackingUrlTemplate.replace("{trackingId}", encodeURIComponent(order.trackingId))
      : null;

  let status;
  switch (order.orderStatus) {
    case "pending":
      status =
        order.paymentStatus === "failed"
          ? "⚠️ The payment for this order didn't go through, so it hasn't been confirmed."
          : "🕒 We've received your order and will confirm it shortly.";
      break;
    case "confirmed":
      status = `✅ Confirmed${statusDate(order, "confirmed") ? ` on ${statusDate(order, "confirmed")}` : ""}. We're getting it ready to pack.`;
      break;
    case "processing":
      status = "📦 Being packed now. You'll get the tracking details as soon as it ships.";
      break;
    case "shipped": {
      const on = statusDate(order, "shipped");
      status = `🚚 Shipped${on ? ` on ${on}` : ""}${partner ? ` via ${partner}` : ""}.`;
      if (order.trackingId) status += `\nTracking ID: ${order.trackingId}`;
      if (trackingUrl) status += `\nTrack it here: ${trackingUrl}`;
      break;
    }
    case "delivered":
      status = `🎉 Delivered${statusDate(order, "delivered") ? ` on ${statusDate(order, "delivered")}` : ""}. We hope your little one loves it!`;
      break;
    case "cancelled":
      status = `❌ Cancelled${statusDate(order, "cancelled") ? ` on ${statusDate(order, "cancelled")}` : ""}.`;
      if (order.paymentStatus === "refunded") status += " Your refund has been processed.";
      break;
    case "returned":
      status = `↩️ Returned${statusDate(order, "returned") ? ` on ${statusDate(order, "returned")}` : ""}.`;
      if (order.paymentStatus === "refunded") status += " Your refund has been processed.";
      break;
    default:
      status = `Status: ${order.orderStatus}.`;
  }

  const detailsUrl = order.userId
    ? `${siteUrl}/account/orders/${order._id}`
    : `${siteUrl}/orders/track`;
  return (
    `Here's your order ${id}:\n${status}\n${summary}\n\n` +
    `Full details: ${detailsUrl}\n` +
    `Need help with it (returns, delays, changes)? Tap the support icon to talk to our team.`
  );
};

module.exports = {
  ORDER_ID_RE,
  normalizeOrderId,
  extractContacts,
  findVerifiedOrder,
  describeOrder,
};
