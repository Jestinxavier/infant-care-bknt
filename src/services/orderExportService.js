const { Parser } = require("json2csv");
const Order = require("../models/Order");

/**
 * Format date in Indian Standard Time (IST, UTC+5:30)
 * Format: DD/MM/YYYY hh:mm A
 *
 * @param {Date|string|null|undefined} dateInput
 * @returns {string}
 */
const formatDateIST = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Capitalize string
 * @param {string} str
 * @returns {string}
 */
const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Format payment method for display
 * @param {string} method
 * @returns {string}
 */
const formatPaymentMethod = (method) => {
  if (!method) return "Unknown";
  const m = method.toLowerCase();
  if (m === "cod") return "Cash on Delivery (COD)";
  if (m === "phonepe") return "PhonePe";
  if (m === "razorpay") return "Razorpay";
  return capitalize(method);
};

/**
 * Clean & format full delivery address
 * @param {Object} addr
 * @returns {string}
 */
const formatFullAddress = (addr) => {
  if (!addr) return "";
  const parts = [
    addr.fullName || addr.name,
    addr.houseName,
    addr.street || addr.addressLine1,
    addr.landmark,
    addr.addressLine2,
    addr.city || addr.district,
    addr.state,
    addr.pincode ? `Pincode: ${addr.pincode}` : null,
    addr.country || "India",
  ].filter(Boolean);
  return parts.join(", ");
};

/**
 * Clean & format items summary for order-level export
 * @param {Array} items
 * @returns {string}
 */
const formatItemsSummary = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      const name = item.name || item.title || "Product";
      const variant = item.variantName || "";
      const variantInfo = variant && variant !== name ? ` (${variant})` : "";
      const giftInfo = item.isGift ? " [Gift]" : "";
      return `${name}${variantInfo}${giftInfo} x ${item.quantity || 1}`;
    })
    .join(" | ");
};

/**
 * Clean & format SKUs
 * @param {Array} items
 * @returns {string}
 */
const formatItemSkus = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  const skus = items
    .map((item) => item.variantSku || item.sku || "")
    .filter(Boolean);
  return [...new Set(skus)].join(", ");
};

/**
 * Clean applied coupons
 * @param {Object} order
 * @returns {string}
 */
const formatCouponCodes = (order) => {
  if (order.coupon?.code) return order.coupon.code;
  if (Array.isArray(order.coupons) && order.coupons.length > 0) {
    return order.coupons.map((c) => c.code).filter(Boolean).join(", ");
  }
  return "";
};

/**
 * Map order document to Order-Level Summary row
 * @param {Object} order
 * @returns {Object}
 */
const mapOrderToSummaryRow = (order) => {
  const shipping = order.shippingAddress || {};
  const guest = order.guestInfo || {};
  const user = order.userId && typeof order.userId === "object" ? order.userId : {};

  const customerName =
    shipping.fullName || shipping.name || guest.name || user.username || "Guest";
  const customerEmail = guest.email || user.email || shipping.email || "";
  const customerPhone = shipping.phone || guest.phone || user.phone || "";
  const customerType = order.isGuestOrder ? "Guest" : "Registered";

  const totalQuantity =
    order.totalQuantity ||
    (Array.isArray(order.items)
      ? order.items.reduce((sum, i) => sum + (i.quantity || 0), 0)
      : 0);

  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.discount ?? 0);
  const shippingCost = Number(order.shippingCost ?? 0);
  const codCost = Number(order.codCost ?? 0);
  const totalAmount = Number(order.totalAmount ?? 0);

  const deliveryPartnerName =
    order.deliveryPartner && typeof order.deliveryPartner === "object"
      ? order.deliveryPartner.name || order.deliveryPartner.code || ""
      : "";

  const refundStatus = order.refundStatus || (order.paymentStatus === "refunded" ? "REFUNDED" : "None");
  const refundAmount = order.refundAmountPaise ? (order.refundAmountPaise / 100).toFixed(2) : "0.00";

  return {
    "Order ID": order.orderId || order._id?.toString() || "",
    "Order Date (IST)": formatDateIST(order.placedAt || order.createdAt),
    "Order Status": capitalize(order.orderStatus),
    "Payment Status": capitalize(order.paymentStatus),
    "Payment Method": formatPaymentMethod(order.paymentMethod),
    "Transaction ID": order.phonepeTransactionId || "",
    "Customer Type": customerType,
    "Customer Name": customerName,
    "Customer Email": customerEmail,
    "Customer Phone": customerPhone,
    "Recipient Name": shipping.fullName || shipping.name || "",
    "Recipient Phone": shipping.phone || "",
    "Address Line 1": [shipping.houseName, shipping.street || shipping.addressLine1]
      .filter(Boolean)
      .join(", "),
    "Address Line 2 / Landmark": [shipping.landmark, shipping.addressLine2]
      .filter(Boolean)
      .join(", "),
    "City / District": shipping.city || shipping.district || "",
    "State": shipping.state || "",
    "Pincode": shipping.pincode || "",
    "Country": shipping.country || "India",
    "Full Shipping Address": formatFullAddress(shipping),
    "Total Items Count": totalQuantity,
    "Items Summary": formatItemsSummary(order.items),
    "Item SKUs": formatItemSkus(order.items),
    "Subtotal (INR)": subtotal.toFixed(2),
    "Coupon Code(s)": formatCouponCodes(order),
    "Discount Amount (INR)": discount.toFixed(2),
    "Shipping Fee (INR)": shippingCost.toFixed(2),
    "COD Handling Fee (INR)": codCost.toFixed(2),
    "Grand Total (INR)": totalAmount.toFixed(2),
    "Delivery Partner": deliveryPartnerName,
    "Tracking Number / AWB": order.trackingId || "",
    "Delivery Notes": order.deliveryNote || "",
    "Refund Status": refundStatus,
    "Refund Amount (INR)": refundAmount,
  };
};

/**
 * Map order document to Line-Item Detailed rows (1 row per item in order)
 * @param {Object} order
 * @returns {Array<Object>}
 */
const mapOrderToItemRows = (order) => {
  const baseOrderInfo = mapOrderToSummaryRow(order);
  const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [{}];

  return items.map((item, index) => {
    const itemPrice = Number(item.price ?? 0);
    const regularPrice = Number(item.regularPrice ?? itemPrice);
    const quantity = Number(item.quantity ?? 1);
    const lineTotal = (itemPrice * quantity).toFixed(2);

    let variantAttributes = "";
    if (item.variantAttributes && typeof item.variantAttributes === "object") {
      variantAttributes = Object.entries(item.variantAttributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }

    return {
      "Order ID": baseOrderInfo["Order ID"],
      "Order Date (IST)": baseOrderInfo["Order Date (IST)"],
      "Item Sequence": index + 1,
      "Product Name": item.name || item.title || "",
      "Variant Name": item.variantName || "",
      "Item SKU": item.variantSku || item.sku || "",
      "Variant Attributes": variantAttributes,
      "Quantity": quantity,
      "Unit Price (INR)": itemPrice.toFixed(2),
      "Regular / MRP (INR)": regularPrice.toFixed(2),
      "Line Total (INR)": lineTotal,
      "Is Gift Item": item.isGift ? "Yes" : "No",
      "Order Status": baseOrderInfo["Order Status"],
      "Payment Status": baseOrderInfo["Payment Status"],
      "Payment Method": baseOrderInfo["Payment Method"],
      "Customer Name": baseOrderInfo["Customer Name"],
      "Customer Phone": baseOrderInfo["Customer Phone"],
      "Customer Email": baseOrderInfo["Customer Email"],
      "Recipient Name": baseOrderInfo["Recipient Name"],
      "Recipient Phone": baseOrderInfo["Recipient Phone"],
      "City": baseOrderInfo["City / District"],
      "State": baseOrderInfo["State"],
      "Pincode": baseOrderInfo["Pincode"],
      "Full Shipping Address": baseOrderInfo["Full Shipping Address"],
      "Order Grand Total (INR)": baseOrderInfo["Grand Total (INR)"],
      "Delivery Partner": baseOrderInfo["Delivery Partner"],
      "Tracking Number / AWB": baseOrderInfo["Tracking Number / AWB"],
    };
  });
};

/**
 * Generate CSV string from orders query
 *
 * @param {Object} options
 * @param {Object} options.filter - MongoDB query filter
 * @param {string} [options.type="orders"] - "orders" (summary) or "items" (detailed)
 * @param {Object} [options.sort={ createdAt: -1 }] - Sort options
 * @returns {Promise<string>} CSV string with UTF-8 BOM
 */
const exportOrdersToCSV = async ({ filter = {}, type = "orders", sort = { createdAt: -1 } }) => {
  const orders = await Order.find(filter)
    .populate("userId", "username email phone")
    .populate("deliveryPartner", "name code")
    .sort(sort)
    .lean();

  let rows = [];
  if (type === "items") {
    rows = orders.flatMap(mapOrderToItemRows);
  } else {
    rows = orders.map(mapOrderToSummaryRow);
  }

  if (rows.length === 0) {
    // Return header-only CSV with BOM if no matching orders
    const emptyRow = type === "items" ? mapOrderToItemRows({})[0] : mapOrderToSummaryRow({});
    const parser = new Parser({ fields: Object.keys(emptyRow) });
    return "\uFEFF" + parser.parse([]);
  }

  const parser = new Parser({ fields: Object.keys(rows[0]) });
  const csv = parser.parse(rows);

  // Prepend UTF-8 Byte Order Mark (\uFEFF) for Excel compatibility
  return "\uFEFF" + csv;
};

module.exports = {
  formatDateIST,
  capitalize,
  formatPaymentMethod,
  formatFullAddress,
  formatItemsSummary,
  formatItemSkus,
  mapOrderToSummaryRow,
  mapOrderToItemRows,
  exportOrdersToCSV,
};
