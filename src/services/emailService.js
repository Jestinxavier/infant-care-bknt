const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const SiteSetting = require("../models/SiteSetting");
const { SITE_SETTING_KEYS } = require("../config/siteSettingRegistry");
const { createGuestReviewToken } = require("../utils/guestReviewToken");
const logger = require("../utils/logger");
const { getGstSettings, ensureInvoiceNumber } = require("./gstService");

/* =====================================================
   ✅ Template Engine (Variables + Conditionals + Loops)
===================================================== */

/**
 * Load and render HTML template safely
 * Supports:
 *  - {{username}}
 *  - {{#condition}} ... {{/condition}}
 *  - {{#items}} ... {{/items}} loops
 */
const loadTemplate = (templateName, data = {}) => {
  const templatePath = path.join(
    __dirname,
    "../mail_templates",
    `${templateName}.html`,
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  let html = fs.readFileSync(templatePath, "utf8");

  // Same logo URL for all templates (no attachment, consistent branding)
  const EMAIL_LOGO_URL =
    "https://dashboard.infantscare.in/logo-invoice.png";
  data.emailLogoDataUrl = EMAIL_LOGO_URL;

  /**
   * ✅ 1. Handle Blocks (Conditionals + Loops)
   */
  html = html.replace(
    /{{#(\w+)}}([\s\S]*?){{\/\1}}/g,
    (match, key, content) => {
      const value = data[key];

      // ✅ LOOP: if value is array
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            let block = content;

            Object.keys(item).forEach((itemKey) => {
              block = block.replace(
                new RegExp(`{{${itemKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}}}`, "g"),
                item[itemKey] ?? "",
              );
            });

            return block;
          })
          .join("");
      }

      // ✅ CONDITIONAL: boolean/string exists
      if (value) return content;

      return "";
    },
  );

  /**
   * ✅ 2. Replace Normal Variables {{key}} and nested {{key.nested}}
   */
  const replaceVars = (obj, prefix = "") => {
    Object.keys(obj).forEach((key) => {
      if (Array.isArray(obj[key])) return;
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date)
      ) {
        replaceVars(value, fullKey);
      } else {
        const safe = (v) => (v == null ? "" : String(v));
        const escaped = fullKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        html = html.replace(new RegExp(`{{${escaped}}}`, "g"), safe(value));
      }
    });
  };
  replaceVars(data);

  return html;
};

/* =====================================================
   ✅ Email Transporter Factory
===================================================== */

const createTransporter = () => {
  // Gmail (Recommended App Password)
  if (process.env.EMAIL_SERVICE === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // SMTP Transport
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

const stripHtml = (html) => {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/\s*\n\s*/g, "\n") // Collapse lines
    .trim();
};

/**
 * Send email using template
 * @param {Object} options
 * @param {Array} [options.attachments] - Optional attachments, e.g. [{ filename, content, cid }] for inline images
 */
const sendTemplateEmail = async ({
  to,
  subject,
  template,
  data,
  attachments,
  headers,
  list,
}) => {
  const transporter = createTransporter();

  const html = loadTemplate(template, data);
  const text = stripHtml(html);

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "Infants Care"}" <${
      process.env.EMAIL_USER
    }>`,
    to,
    subject,
    html,
    text,
  };
  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }
  // Optional emails: List-Unsubscribe headers (Gmail's own Unsubscribe button)
  if (headers) mailOptions.headers = headers;
  if (list) mailOptions.list = list;

  return transporter.sendMail(mailOptions);
};

/* =====================================================
   ✅ OTP Generator
===================================================== */

const generateOTP = () =>
  require("crypto").randomInt(100000, 1000000).toString();

/* =====================================================
   ✅ Email Functions
===================================================== */

/**
 * ✅ Send OTP Email
 */
const sendOTPEmail = async (user, otp) => {
  return sendTemplateEmail({
    to: user.email,
    subject: "Your Verification Code - Infants Care",
    template: "otp-verification",
    data: {
      username: user.username || "Customer",
      otp,
    },
  });
};

/**
 * ✅ Send Email Verified Welcome Email
 */
const sendWelcomeEmail = async (user) => {
  return sendTemplateEmail({
    to: user.email,
    subject: "Email Verified Successfully! - Infants Care",
    template: "email-verified",
    data: {
      username: user.username || "Customer",
    },
  });
};

/**
 * ✅ Send Password Reset Email
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${
    process.env.DASHBOARD_URL || "http://localhost:5173"
  }/reset-password?token=${resetToken}`;

  return sendTemplateEmail({
    to: user.email,
    subject: "Password Reset Request - Infants Care",
    template: "password-reset",
    data: {
      username: user.username || "Customer",
      resetUrl,
    },
  });
};

/**
 * ✅ Send Admin Credentials Email
 */
const sendAdminCredentialsEmail = async (user, password) => {
  const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:5173";

  return sendTemplateEmail({
    to: user.email,
    subject: "🔐 Admin Dashboard Credentials",
    template: "admin-credentials",
    data: {
      username: user.username || "Admin",
      email: user.email,
      password,
      dashboardUrl,
    },
  });
};

/**
 * Helper to resolve user/recipient object for email sending.
 * Works seamlessly for both registered users and guest users.
 * @param {import('../models/Order').default|Object} order
 * @returns {Promise<{ username: string, email: string }|null>}
 */
const getOrderRecipient = async (order) => {
  if (!order) return null;

  // 1. Check guestInfo
  if (order.guestInfo?.email) {
    return {
      username:
        order.guestInfo.name ||
        order.shippingAddress?.fullName ||
        order.shippingAddress?.name ||
        "Customer",
      email: order.guestInfo.email,
    };
  }

  // 2. Check populated userId object
  if (order.userId && typeof order.userId === "object" && order.userId.email) {
    return {
      username:
        order.userId.username ||
        order.shippingAddress?.fullName ||
        order.shippingAddress?.name ||
        "Customer",
      email: order.userId.email,
    };
  }

  // 3. Lookup userId by ID
  if (order.userId) {
    try {
      const User = require("../models/user");
      const user = await User.findById(order.userId).select("username email").lean();
      if (user?.email) {
        return {
          username:
            user.username ||
            order.shippingAddress?.fullName ||
            order.shippingAddress?.name ||
            "Customer",
          email: user.email,
        };
      }
    } catch {
      // Fallthrough
    }
  }

  // 4. Fallback: shippingAddress email
  if (order.shippingAddress?.email) {
    return {
      username:
        order.shippingAddress.fullName ||
        order.shippingAddress.name ||
        "Customer",
      email: order.shippingAddress.email,
    };
  }

  return null;
};

/**
 * ✅ Send Shipment Email
 */
const sendShipmentEmail = async (user, order) => {
  let recipient = user;
  if (!recipient?.email && order) {
    recipient = await getOrderRecipient(order);
  }
  if (!recipient?.email) return;

  const trackingUrl =
    order.trackingId && order.deliveryPartner?.trackingUrlTemplate
      ? order.deliveryPartner.trackingUrlTemplate.replace(
          "{trackingId}",
          order.trackingId,
        )
      : null;

  const items = order.items.map((item) => ({
    productName: item.name || item.productId?.name || item.productName || "Product",
    quantity: item.quantity,
    price: item.price,
  }));

  return sendTemplateEmail({
    to: recipient.email,
    subject: `Order #${order.orderId.toUpperCase()} Shipped - Infants Care`,
    template: "shipment-notification",
    data: {
      username: recipient.username || "Customer",
      orderId: order.orderId.toUpperCase(),
      trackingId: order.trackingId,
      trackingUrl,
      deliveryPartner: !!order.deliveryPartner,
      deliveryPartnerName: order.deliveryPartner?.name || "",
      items,
    },
  });
};

/**
 * ✅ Send Order Cancelled Email
 */
const sendOrderCancelledEmail = async (user, order) => {
  let recipient = user;
  if (!recipient?.email && order) {
    recipient = await getOrderRecipient(order);
  }
  if (!recipient?.email) return;

  const items = (order.items || []).map((item) => ({
    productName: item.productId?.name || item.productName || item.name,
    quantity: item.quantity,
    price: item.price,
  }));

  return sendTemplateEmail({
    to: recipient.email,
    subject: `Order #${(order.orderId || "").toUpperCase()} Cancelled - Infants Care`,
    template: "order-cancelled",
    data: {
      username: recipient.username || "Customer",
      orderId: (order.orderId || "").toUpperCase(),
      items,
    },
  });
};

/**
 * Issue (or read) a GST order's invoice number. Never throws: a numbering
 * failure is logged and must not stop the email.
 */
const issueInvoiceNumber = async (order) => {
  if (!order?.gst) return null;
  if (order.gst.invoiceNumber) return order.gst.invoiceNumber;
  if (!order._id) return null;
  try {
    const number = await ensureInvoiceNumber(order._id);
    if (number) order.gst.invoiceNumber = number;
    return number;
  } catch (err) {
    logger.error("[GST] Failed to assign invoice number", {
      orderId: order.orderId,
      error: err.message,
    });
    return null;
  }
};

/**
 * GST summary rows for an invoice, following one place's display choices.
 * `show` is a { gstin, simple, breakdown, taxable, pos } map.
 */
const buildGstLines = (gst, show, formatMoney) => {
  if (!gst || !show) return [];
  const lines = [];
  if (show.taxable) lines.push({ label: "Price before GST", value: formatMoney(gst.taxableValue) });
  if (show.breakdown) {
    if (gst.supplyType === "inter") {
      lines.push({ label: "IGST", value: formatMoney(gst.igst) });
    } else {
      lines.push({ label: "CGST", value: formatMoney(gst.cgst) });
      lines.push({ label: "SGST", value: formatMoney(gst.sgst) });
    }
  }
  if (show.simple) lines.push({ label: "Includes GST of", value: formatMoney(gst.totalTax) });
  if (show.pos && gst.placeOfSupply) lines.push({ label: "Place of supply", value: gst.placeOfSupply });
  if (show.gstin && gst.sellerGstin) lines.push({ label: "Seller GSTIN", value: gst.sellerGstin });
  return lines;
};

/**
 * ✅ Send Invoice Email
 */
const sendInvoiceEmail = async (user, order) => {
  let recipient = user;
  if (!recipient?.email && order) {
    recipient = await getOrderRecipient(order);
  }
  if (!recipient?.email) return;

  const fromAddressSetting = await SiteSetting.findOne({
    key: SITE_SETTING_KEYS.ORDER_FROM_ADDRESS,
  }).lean();
  const rawFromAddress = fromAddressSetting?.value ?? null;
  const fromAddress = rawFromAddress
    ? {
        ...rawFromAddress,
        additionalInstruction:
          rawFromAddress.additionalInstruction || rawFromAddress.landmark || "",
      }
    : null;

  const orderDate = new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formatMoney = (n) => `₹${Number(n).toFixed(2)}`;

  const ship = order.shippingAddress || {};
  const line1 =
    [ship.addressLine1, ship.addressLine2].filter(Boolean).join(", ") ||
    ship.street ||
    "—";
  const addressBlock = {
    name: ship.name || ship.fullName || "—",
    line1,
    city: ship.city || "—",
    state:
      ship.state && ship.state.includes("_")
        ? ship.state.split("_").slice(1).join("_")
        : ship.state || "—",
    country: ship.country || "—",
    phone: ship.phone || "—",
  };

  // GST: only for orders placed with GST on, shown per the "Email" column of
  // the GST display settings. Sending the invoice is what issues its number.
  const gstSettings = order.gst ? await getGstSettings() : null;
  const gstShow = gstSettings?.enabled ? gstSettings.display.email : null;
  const invoiceNumber = await issueInvoiceNumber(order);
  const gstLines = gstShow ? buildGstLines(order.gst, gstShow, formatMoney) : [];

  const items = order.items.map((item) => {
    const offerPrice = Number(item.price) || 0;
    const mrp = Number(item.regularPrice) > 0 ? Number(item.regularPrice) : offerPrice;
    const hasSaving = mrp > offerPrice;
    return {
      // The template engine has no nested conditionals, so pass the ready text.
      hsnLine: gstShow?.hsn && item.hsnCode ? ` · HSN ${item.hsnCode}` : "",
      productName: item.name || item.productId?.name || item.productName || "Product",
      quantity: item.quantity,
      price: offerPrice,
      mrpFormatted: hasSaving ? formatMoney(mrp) : "",
      priceFormatted: formatMoney(offerPrice),
      itemTotal: (offerPrice * item.quantity).toFixed(2),
    };
  });

  const codCost = Number(order.priceObj?.codCost) || Number(order.codCost) || 0;
  const codCostFormatted = codCost > 0 ? formatMoney(codCost) : "";

  // Build discount lines: product discount + each coupon separately
  const discountLines = [];
  const productDiscount = Number(order.priceObj?.productDiscount) || 0;
  if (productDiscount > 0) {
    discountLines.push({ label: "Product Discount", amount: `-${formatMoney(productDiscount)}` });
  }
  const rawCoupons = Array.isArray(order.coupons) && order.coupons.length
    ? order.coupons
    : order.coupon?.discountAmount
      ? [order.coupon]
      : [];
  for (const c of rawCoupons) {
    if ((c.discountAmount || 0) > 0) {
      discountLines.push({
        label: c.code ? `Coupon (${c.code})` : "Coupon Discount",
        amount: `-${formatMoney(c.discountAmount)}`,
      });
    }
  }
  // Fallback: no breakdown available but a flat discount exists
  if (!discountLines.length && (order.discount || 0) > 0) {
    discountLines.push({ label: "Discount", amount: `-${formatMoney(order.discount)}` });
  }

  return sendTemplateEmail({
    to: recipient.email,
    subject: `Invoice for Order #${order.orderId.toUpperCase()} - Infants Care`,
    template: "invoice",
    data: {
      username: recipient.username || "Customer",
      orderId: order.orderId.toUpperCase(),
      orderDate,
      orderStatus: order.orderStatus || order.status,
      paymentMethod: order.paymentMethod || "N/A",

      storeName: process.env.STORE_NAME || "Infants Care",
      estimatedDelivery:
        order.estimatedDelivery || "We'll notify you when shipped",

      subtotalFormatted: formatMoney(order.subtotal || 0),
      shippingFormatted: formatMoney(order.shippingCost || 0),
      codCostFormatted: codCostFormatted || null,
      totalFormatted: formatMoney(order.totalAmount || order.total || 0),

      discountLines,
      gstLines,
      invoiceNumber: gstShow?.invno ? invoiceNumber : null,

      shippingAddress: addressBlock,
      fromAddress,

      supportEmail:
        process.env.SUPPORT_EMAIL ||
        process.env.EMAIL_USER ||
        "support@infantscare.com",
      year: new Date().getFullYear(),

      frontendUrl: process.env.FRONTEND_URL,
      items,
    },
  });
};

/**
 * ✅ Send Refund Initiated Email
 */
const sendRefundInitiatedEmail = async (user, order, refundAmountPaise) => {
  let recipient = user;
  if (!recipient?.email && order) {
    recipient = await getOrderRecipient(order);
  }
  if (!recipient?.email) return;

  const refundAmountRupees = (refundAmountPaise / 100).toFixed(2);

  return sendTemplateEmail({
    to: recipient.email,
    subject: `Refund of ₹${refundAmountRupees} Initiated — Order #${(order.orderId || "").toUpperCase()} - Infants Care`,
    template: "refund-initiated",
    data: {
      username: recipient.username || "Customer",
      orderId: (order.orderId || "").toUpperCase(),
      refundAmount: refundAmountRupees,
      refundReason: order.refundReason || "",
      supportEmail:
        process.env.SUPPORT_EMAIL ||
        process.env.EMAIL_USER ||
        "support@infantscare.com",
      year: new Date().getFullYear(),
    },
  });
};

/**
 * Send a review request after delivery. Guest orders receive a signed,
 * expiring link so they can review without creating an account.
 */
const sendReviewRequestEmail = async (order) => {
  const recipient = await getOrderRecipient(order);
  if (!recipient?.email || !order?._id) return;

  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  let reviewUrl;
  if (order.isGuestOrder || !order.userId) {
    const token = createGuestReviewToken(order);
    if (!token) return;
    reviewUrl = `${frontendUrl}/orders/track?reviewToken=${encodeURIComponent(token)}`;
  } else {
    reviewUrl = `${frontendUrl}/account/orders/${encodeURIComponent(String(order._id))}`;
  }

  // Gifts are included in the order for fulfilment, but are not reviewable.
  // Keep them out of the email so every listed item can actually be reviewed.
  const items = (order.items || [])
    .filter((item) => !item.isGift)
    .map((item) => ({
      productName: item.name || item.productId?.name || item.productName || "Product",
      quantity: item.quantity || 1,
    }));

  // Do not send a review request for an order that contains only free gifts.
  if (items.length === 0) return;

  return sendTemplateEmail({
    to: recipient.email,
    subject: `How was your order #${String(order.orderId || "").toUpperCase()}?`,
    template: "review-request",
    data: {
      username: recipient.username || "Customer",
      orderId: String(order.orderId || "").toUpperCase(),
      reviewUrl,
      items,
    },
  });
};

/** Escape customer-entered text before it goes into email HTML. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Tell a customer who has left the site that support replied to their chat.
 * Everything typed by staff or the customer is escaped: the template engine
 * inserts values as raw HTML.
 */
const sendChatReplyEmail = async ({ to, customerName, staffName, reply }) => {
  if (!to) return;
  const siteUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return sendTemplateEmail({
    to,
    subject: "You have a reply from Infants Care support",
    template: "chat-reply",
    data: {
      customerName: escapeHtml(customerName || "there"),
      staffName: escapeHtml(staffName || "Someone"),
      reply: escapeHtml(String(reply || "").slice(0, 2000)),
      siteUrl,
    },
  });
};

const formatInr = (n) =>
  Math.round(Number(n) || 0).toLocaleString("en-IN");

/**
 * Abandoned-cart reminder (an OPTIONAL email: the caller has already checked
 * the recipient hasn't unsubscribed from "cart_reminders").
 * @param {{ email: string, username?: string }} recipient
 * @param {object} cart Cart document (lean)
 * @param {{ step: number, restoreUrl: string, unsubscribeUrl: string,
 *   lineTotals: Map<string, number>, cartTotal: number,
 *   oneClickUnsubscribeUrl: string,
 *   coupon?: { code: string, percent: number, maxDiscount: number, validHours: number } }} options
 */
const sendAbandonedCartEmail = async (recipient, cart, options) => {
  if (!recipient?.email) return;
  const {
    step,
    restoreUrl,
    unsubscribeUrl,
    oneClickUnsubscribeUrl,
    coupon,
    lineTotals,
    cartTotal,
  } = options;

  // Cart items hold no price; the caller passes current prices per item
  const items = (cart.items || []).slice(0, 6).map((item) => ({
    title: escapeHtml(item.titleSnapshot || "Product"),
    image: escapeHtml(item.imageSnapshot || ""),
    quantity: item.quantity || 1,
    lineTotal: formatInr(lineTotals?.get(String(item._id)) || 0),
  }));
  if (!items.length) return;

  const hasCoupon = !!coupon?.code;
  const subject = hasCoupon
    ? `${coupon.percent}% off your cart, for the next ${coupon.validHours} hours`
    : step === 1
      ? "You left something in your cart"
      : "Your cart is still waiting for you";
  const intro = hasCoupon
    ? "Your cart is still saved. Here's a private code to make it a little easier, valid for one order."
    : "You left a few things in your cart. We've saved them for you, so you can pick up right where you left off.";

  return sendTemplateEmail({
    to: recipient.email,
    subject,
    template: "abandoned-cart",
    data: {
      heading: subject,
      username: escapeHtml(recipient.username || "there"),
      intro,
      items,
      cartTotal: formatInr(cartTotal),
      hasCoupon,
      couponCode: hasCoupon ? escapeHtml(coupon.code) : "",
      couponText: hasCoupon
        ? `${coupon.percent}% off (up to ₹${formatInr(coupon.maxDiscount)}), one use, expires in ${coupon.validHours} hours`
        : "",
      restoreUrl,
      unsubscribeUrl,
    },
    // RFC 8058 one-click unsubscribe, shown by Gmail/Yahoo next to the sender
    list: { unsubscribe: { url: oneClickUnsubscribeUrl, comment: "Unsubscribe" } },
    headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
};

/* =====================================================
   ✅ EXPORTS
===================================================== */

/**
 * Send order confirmation email to a guest (no user account).
 * Reuses the invoice template with a synthetic user-shaped object.
 * @param {{ name: string, email: string, phone: string }} guestInfo
 * @param {import('../models/Order').default} order
 */
const sendGuestOrderConfirmationEmail = async (guestInfo, order) => {
  const fakeUser = {
    username: guestInfo.name,
    email: guestInfo.email,
  };
  return sendInvoiceEmail(fakeUser, order);
};

/**
 * Send an order confirmation/invoice email for any order — guest or registered.
 * Works from just the order document (no req.user needed).
 * Safe to call fire-and-forget with .catch().
 */
const sendOrderConfirmationEmail = async (order, { onlyOnce = false } = {}) => {
  // Confirmation is the sale, so issue the GST invoice number now, even when
  // the customer has no email address to send the invoice to.
  await issueInvoiceNumber(order);
  const recipient = await getOrderRecipient(order);
  if (!recipient?.email) return;

  if (!onlyOnce || !order?._id) {
    return sendInvoiceEmail(recipient, order);
  }

  // Atomic claim: only the first caller flips confirmationEmailSentAt from
  // null, so concurrent payment callbacks can't both send. (null also matches
  // orders created before this field existed.)
  const Order = require("../models/Order");
  const claim = await Order.updateOne(
    { _id: order._id, confirmationEmailSentAt: null },
    { $set: { confirmationEmailSentAt: new Date() } },
  );
  if (!claim.modifiedCount) {
    logger.info(
      `[email] Order confirmation for ${order.orderId || order._id} already sent, skipping duplicate`,
    );
    return;
  }
  try {
    return await sendInvoiceEmail(recipient, order);
  } catch (error) {
    // Release the claim so a later callback (or a retry) can still send it
    await Order.updateOne(
      { _id: order._id },
      { $set: { confirmationEmailSentAt: null } },
    ).catch(() => {});
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAdminCredentialsEmail,
  sendShipmentEmail,
  sendOrderCancelledEmail,
  sendInvoiceEmail,
  sendRefundInitiatedEmail,
  sendReviewRequestEmail,
  sendGuestOrderConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAbandonedCartEmail,
  sendChatReplyEmail,
  getOrderRecipient,
};
