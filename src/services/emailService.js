const nodemailer = require("nodemailer");
const crypto = require("crypto");

/**
 * Create email transporter
 * Configure based on your email provider
 */
const createTransporter = () => {
  // For Gmail
  if (process.env.EMAIL_SERVICE === "gmail") {
    console.log("Using Gmail SMTP", { mail: process.env.EMAIL_PASSWORD, pass: process.env.EMAIL_USER });
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
      },
    });
  }

  // For other SMTP services
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Generate 6-digit OTP
 * @returns {string} - 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP verification email
 * @param {Object} user - User object with email and username
 * @param {string} otp - 6-digit OTP
 */
const sendOTPEmail = async (user, otp) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${process.env.EMAIL_USER
        }>`,
      to: user.email,
      subject: "🔐 Your Verification Code - Online Shopping",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 10px; }
            .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hi ${user.username || "there"}! 👋</h2>
              <p>Thank you for registering with <strong>Online Shopping</strong>. To complete your registration, please use the verification code below:</p>
              
              <div class="otp-box">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Verification Code</p>
                <div class="otp-code">${otp}</div>
                <p style="margin: 0; color: #666; font-size: 12px; margin-top: 10px;">Enter this code to verify your email</p>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul style="margin: 5px 0;">
                  <li>This code will expire in <strong>10 minutes</strong></li>
                  <li>Do not share this code with anyone</li>
                  <li>If you didn't request this, please ignore this email</li>
                </ul>
              </div>
              
              <p>Enter this code on the verification page to activate your account and start shopping!</p>
              
              <p>Best regards,<br>The Online Shopping Team</p>
            </div>
            <div class="footer">
              <p>© 2025 Online Shopping. All rights reserved.</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ OTP email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending OTP email:", error);
    throw new Error("Failed to send OTP email");
  }
};

/**
 * Send welcome email after successful verification
 * @param {Object} user - User object
 */
const sendWelcomeEmail = async (user) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${process.env.EMAIL_USER
        }>`,
      to: user.email,
      subject: "🎉 Welcome to Online Shopping!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #667eea; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Email Verified Successfully!</h1>
            </div>
            <div class="content">
              <h2>Welcome, ${user.username}! 🎊</h2>
              <p>Your email has been verified successfully. You can now enjoy all the features of Online Shopping!</p>
              
              <h3>What's Next?</h3>
              
              <div class="feature">
                <strong>🛍️ Start Shopping</strong>
                <p>Browse our wide range of products and find what you love.</p>
              </div>
              
              <div class="feature">
                <strong>⭐ Write Reviews</strong>
                <p>Share your experience with products you purchase.</p>
              </div>
              
              <div class="feature">
                <strong>🚚 Track Orders</strong>
                <p>Monitor your orders from placement to delivery.</p>
              </div>
              
              <p>If you have any questions, feel free to contact our support team.</p>
              
              <p>Happy Shopping! 🛒</p>
              
              <p>Best regards,<br>The Online Shopping Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Welcome email sent to:", user.email);
  } catch (error) {
    console.error("❌ Error sending welcome email:", error);
    // Don't throw error for welcome email, it's not critical
  }
};

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {string} resetToken - Password reset token
 */
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const transporter = createTransporter();

    // Use dashboard URL for admin password reset, fallback to frontend URL
    const resetUrl = `${process.env.DASHBOARD_URL || process.env.FRONTEND_URL || "http://localhost:5173"
      }/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${process.env.EMAIL_USER
        }>`,
      to: user.email,
      subject: "🔒 Password Reset Request",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hi ${user.username},</h2>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you didn't request this, please ignore this email.
              </div>
              
              <p>Best regards,<br>The Online Shopping Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Password reset email sent to:", user.email);
  } catch (error) {
    console.error("❌ Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
};

/**
 * Send admin credentials email
 * @param {Object} user - User object with email and username
 * @param {string} password - Generated password
 */
const sendAdminCredentialsEmail = async (user, password) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${process.env.EMAIL_USER
        }>`,
      to: user.email,
      subject: "🔐 Admin Account Created - Dashboard Access Credentials",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 30px auto; padding: 0; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: bold; }
            .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
            .content { padding: 40px 30px; background: #ffffff; }
            .credentials-box { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); border: 2px solid #667eea; padding: 25px; margin: 25px 0; border-radius: 10px; text-align: center; }
            .credential-item { margin: 15px 0; }
            .credential-label { font-size: 14px; color: #666; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
            .credential-value { font-size: 24px; font-weight: bold; color: #667eea; font-family: 'Courier New', monospace; padding: 12px; background: white; border-radius: 6px; margin-top: 5px; display: inline-block; min-width: 200px; }
            .password-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 25px 0; border-radius: 5px; }
            .password-box strong { color: #856404; display: block; margin-bottom: 10px; font-size: 16px; }
            .password-box ul { margin: 10px 0; padding-left: 20px; color: #856404; }
            .password-box li { margin: 5px 0; }
            .info-box { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 20px; margin: 25px 0; border-radius: 5px; }
            .info-box strong { color: #0d47a1; display: block; margin-bottom: 10px; font-size: 16px; }
            .button { display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; font-size: 16px; }
            .footer { background: #f9f9f9; padding: 25px 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #e0e0e0; }
            .footer p { margin: 5px 0; }
            .security-note { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center; }
            .security-note strong { color: #856404; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Admin Account Created</h1>
              <p>Your Dashboard Access Credentials</p>
            </div>
            <div class="content">
              <h2 style="color: #333; margin-top: 0;">Hello ${user.username || "Admin"}! 👋</h2>
              <p style="font-size: 16px; color: #555;">Your admin account has been successfully created for the <strong>Online Shopping Dashboard</strong>. Use the credentials below to access the admin panel.</p>
              
              <div class="credentials-box">
                <div class="credential-item">
                  <div class="credential-label">Email Address</div>
                  <div class="credential-value" style="font-size: 18px; color: #333;">${user.email}</div>
                </div>
                <div class="credential-item">
                  <div class="credential-label">Password</div>
                  <div class="credential-value" style="font-size: 20px; color: #dc3545; background: #ffe6e6;">${password}</div>
                </div>
              </div>

              <div class="security-note">
                <strong>🔒 Security Alert:</strong> Please change this password immediately after your first login for security purposes.
              </div>

              <div class="password-box">
                <strong>⚠️ Important Security Instructions:</strong>
                <ul style="text-align: left;">
                  <li>Keep these credentials confidential and secure</li>
                  <li>Do not share this password with anyone</li>
                  <li>Change your password after first login</li>
                  <li>Use a strong, unique password</li>
                  <li>Enable two-factor authentication if available</li>
                </ul>
              </div>

              <div class="info-box">
                <strong>📋 Next Steps:</strong>
                <ol style="text-align: left; margin: 10px 0; padding-left: 20px; color: #0d47a1;">
                  <li>Visit the admin dashboard login page</li>
                  <li>Enter your email and password</li>
                  <li>Change your password immediately</li>
                  <li>Explore the dashboard features</li>
                </ol>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.DASHBOARD_URL || "http://localhost:5173"}/login" class="button">Access Admin Dashboard →</a>
              </div>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                If you have any questions or need assistance, please contact the system administrator.
              </p>

              <p style="margin-top: 20px;">
                Best regards,<br>
                <strong style="color: #667eea;">The Online Shopping Team</strong>
              </p>
            </div>
            <div class="footer">
              <p><strong>© 2025 Online Shopping Admin Dashboard</strong></p>
              <p>This is an automated email. Please do not reply to this message.</p>
              <p style="margin-top: 10px; color: #999;">For security reasons, this email contains sensitive information. Please delete it after saving your credentials securely.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Admin credentials email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending admin credentials email:", error);
    throw new Error("Failed to send admin credentials email");
  }
};

/**
 * Send shipment notification email
 * @param {Object} user - User object
 * @param {Object} order - Order object with tracking and delivery info
 */
const sendShipmentEmail = async (user, order) => {
  try {
    const transporter = createTransporter();

    // Construct tracking URL if delivery partner and tracking ID are present
    let trackingUrl = null;
    if (order.trackingId && order.deliveryPartner?.trackingUrlTemplate) {
      trackingUrl = order.deliveryPartner.trackingUrlTemplate.replace("{trackingId}", order.trackingId);
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Infant Care"}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `🚚 Your Order #${order.orderId.toUpperCase()} has been Shipped!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
            .header { background: #1e293b; color: white; padding: 40px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .tracking-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; }
            .tracking-id { font-family: monospace; font-size: 20px; font-weight: bold; color: #2563eb; display: block; margin: 10px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #1e293b; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px; }
            .footer { border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
            .item-list { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .item-list th { text-align: left; font-size: 12px; text-transform: uppercase; color: #94a3b8; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
            .item-list td { padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Great news! Your order is on its way.</h1>
            </div>
            <div class="content">
              <p>Hello ${user.username || "valuable customer"},</p>
              <p>Your order <strong>#${order.orderId.toUpperCase()}</strong> has been shipped and is heading your way!</p>
              
              <div class="tracking-box">
                <span style="font-size: 14px; color: #64748b;">Tracking Number</span>
                <span class="tracking-id">${order.trackingId}</span>
                ${order.deliveryPartner ? `<p style="margin: 5px 0;">Courier: <strong>${order.deliveryPartner.name}</strong></p>` : ""}
                ${trackingUrl ? `<a href="${trackingUrl}" class="button">Track Package</a>` : ""}
              </div>

              <h3>Order Summary</h3>
              <table class="item-list">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style="text-align: center;">Qty</th>
                    <th style="text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td>${item.productId?.name || "Order Item"}</td>
                      <td style="text-align: center;">${item.quantity}</td>
                      <td style="text-align: right;">₹${item.price}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              <p style="margin-top: 30px;">If you have any questions, feel free to contact our support team.</p>
              <p>Thank you for shopping with us!</p>
              <p>Best regards,<br><strong>Infant Care Team</strong></p>
            </div>
            <div class="footer">
              <p>© 2025 Infant Care. All rights reserved.</p>
              <p>This is an automated shipment notification.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Shipment email sent to ${user.email} for order ${order.orderId}`);
  } catch (error) {
    console.error("❌ Error sending shipment email:", error);
    // Silent fail for non-critical emails
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendAdminCredentialsEmail,
  sendShipmentEmail,
};
