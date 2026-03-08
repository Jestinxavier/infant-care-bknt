const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

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
    "https://res.cloudinary.com/dkosvbrgw/image/upload/v1771013464/assets/55ff283583f31819ce1c8afd4cd9793238fb0cc7872fa46124888a67e43bca7b.png";
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
                new RegExp(`{{${itemKey}}}`, "g"),
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

/* =====================================================
   ✅ Universal Send Function
===================================================== */

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
}) => {
  const transporter = createTransporter();

  const html = loadTemplate(template, data);

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "Infants Care"}" <${
      process.env.EMAIL_USER
    }>`,
    to,
    subject,
    html,
  };
  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  return transporter.sendMail(mailOptions);
};

/* =====================================================
   ✅ OTP Generator
===================================================== */

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* =====================================================
   ✅ Email Functions
===================================================== */

/**
 * ✅ Send OTP Email
 */
const sendOTPEmail = async (user, otp) => {
  return sendTemplateEmail({
    to: user.email,
    subject: "🔐 Your Verification Code - Infants Care",
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
    subject: "🎉 Email Verified Successfully!",
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
    subject: "🔒 Password Reset Request",
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
 * ✅ Send Shipment Email
 */
const sendShipmentEmail = async (user, order) => {
  const trackingUrl =
    order.trackingId && order.deliveryPartner?.trackingUrlTemplate
      ? order.deliveryPartner.trackingUrlTemplate.replace(
          "{trackingId}",
          order.trackingId,
        )
      : null;

  const items = order.items.map((item) => ({
    productName: item.productId?.name || item.productName,
    quantity: item.quantity,
    price: item.price,
  }));

  return sendTemplateEmail({
    to: user.email,
    subject: `📦 Order #${order.orderId.toUpperCase()} Shipped`,
    template: "shipment-notification",
    data: {
      username: user.username || "Customer",
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
  if (!user?.email) return;

  const items = (order.items || []).map((item) => ({
    productName: item.productId?.name || item.productName || item.name,
    quantity: item.quantity,
    price: item.price,
  }));

  return sendTemplateEmail({
    to: user.email,
    subject: `Order #${(order.orderId || "").toUpperCase()} Cancelled`,
    template: "order-cancelled",
    data: {
      username: user.username || "Customer",
      orderId: (order.orderId || "").toUpperCase(),
      items,
    },
  });
};

/**
 * ✅ Send Invoice Email
 */
const sendInvoiceEmail = async (user, order) => {
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

  const items = order.items.map((item) => ({
    productName:
      item.name || item.productId?.name || item.productName || "Product",
    quantity: item.quantity,
    price: item.price,
    priceFormatted: formatMoney(item.price),
    itemTotal: (item.price * item.quantity).toFixed(2),
  }));

  return sendTemplateEmail({
    to: user.email,
    subject: `🧾 Invoice for Order #${order.orderId.toUpperCase()}`,
    template: "invoice",
    data: {
      username: user.username || "Customer",
      orderId: order.orderId.toUpperCase(),
      orderDate,
      orderStatus: order.orderStatus || order.status,
      paymentMethod: order.paymentMethod || "N/A",

      storeName: process.env.STORE_NAME || "Infants Care",
      estimatedDelivery:
        order.estimatedDelivery || "We'll notify you when shipped",

      subtotal: (order.subtotal || 0).toFixed(2),
      shippingCost: (order.shippingCost || 0).toFixed(2),
      subtotalFormatted: formatMoney(order.subtotal || 0),
      shippingFormatted: formatMoney(order.shippingCost || 0),
      totalFormatted: formatMoney(order.totalAmount || order.total || 0),
      discountFormatted: `-${formatMoney(order.discount || 0)}`,

      hasDiscount: (order.discount || 0) > 0,
      discount: (order.discount || 0).toFixed(2),

      total: (order.totalAmount || order.total || 0).toFixed(2),

      shippingAddress: addressBlock,

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

/* =====================================================
   ✅ EXPORTS
===================================================== */

/**
 * ✅ Send Refund Initiated Email
 */
const sendRefundInitiatedEmail = async (user, order, refundAmountPaise) => {
  if (!user?.email) return;

  const refundAmountRupees = (refundAmountPaise / 100).toFixed(2);

  return sendTemplateEmail({
    to: user.email,
    subject: `✅ Refund of ₹${refundAmountRupees} Initiated — Order #${(order.orderId || "").toUpperCase()}`,
    template: "refund-initiated",
    data: {
      username: user.username || "Customer",
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

/* =====================================================
   ✅ EXPORTS
===================================================== */

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
};
