const nodemailer = require("nodemailer");
const crypto = require("crypto");

/**
 * Create email transporter
 * Configure based on your email provider
 */
const createTransporter = () => {
  // For Gmail
  if (process.env.EMAIL_SERVICE === "gmail") {
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
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${
        process.env.EMAIL_USER
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
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${
        process.env.EMAIL_USER
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

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Online Shopping"}" <${
        process.env.EMAIL_USER
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

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
};
