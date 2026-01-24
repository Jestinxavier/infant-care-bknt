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
   * ✅ 2. Replace Normal Variables {{key}}
   */
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) return;

    html = html.replace(new RegExp(`{{${key}}}`, "g"), data[key] ?? "");
  });

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
 */
const sendTemplateEmail = async ({ to, subject, template, data }) => {
  const transporter = createTransporter();

  const html = loadTemplate(template, data);

  return transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || "Infants Care"}" <${
      process.env.EMAIL_USER
    }>`,
    to,
    subject,
    html,
  });
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
    process.env.FRONTEND_URL || "http://localhost:5173"
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
 * ✅ Send Invoice Email
 */
const sendInvoiceEmail = async (user, order) => {
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const items = order.items.map((item) => ({
    productName: item.productId?.name || item.productName,
    quantity: item.quantity,
    price: item.price,
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

      subtotal: (order.subtotal || 0).toFixed(2),
      shippingCost: (order.shippingCost || 0).toFixed(2),

      hasDiscount: (order.discount || 0) > 0,
      discount: (order.discount || 0).toFixed(2),

      total: (order.totalAmount || order.total || 0).toFixed(2),

      frontendUrl: process.env.FRONTEND_URL,
      items,
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
  sendInvoiceEmail,
};
