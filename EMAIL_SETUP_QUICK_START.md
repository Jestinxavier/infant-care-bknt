# 📧 Email Verification - Quick Start Guide

## ✅ What's Been Implemented

### 1. **User Model Updated** ([`user.js`](src/models/user.js))
Added email verification fields:
- `isEmailVerified` - Boolean (default: false)
- `emailVerificationToken` - String (32-byte hex token)
- `emailVerificationExpires` - Date (24 hours from creation)

### 2. **Email Service Created** ([`emailService.js`](src/services/emailService.js))
Functions:
- ✅ `sendVerificationEmail()` - Beautiful HTML verification email
- ✅ `sendWelcomeEmail()` - Welcome email after verification
- ✅ `sendPasswordResetEmail()` - Password reset email (bonus)
- ✅ `generateVerificationToken()` - Secure token generation

### 3. **Auth Service Updated** ([`service.js`](src/services/service.js))
- ✅ `registerUser()` - Sends verification email on registration
- ✅ `loginUser()` - Checks if email is verified before login
- ✅ `verifyEmail()` - Verifies email with token
- ✅ `resendVerificationEmail()` - Resends verification email

### 4. **New Controllers** 
- ✅ [`verifyEmail.js`](src/controllers/auth/verifyEmail.js) - Handle email verification
- ✅ [`resendVerification.js`](src/controllers/auth/resendVerification.js) - Resend verification

### 5. **New API Routes** ([`auth.js`](src/routes/auth.js))
- ✅ `GET /api/v1/auth/verify-email/:token` - Verify email
- ✅ `POST /api/v1/auth/resend-verification` - Resend email

### 6. **Environment Variables Added**
Both `development.env` and `production.env` updated with email configuration.

---

## 🚀 Quick Setup (3 Steps)

### Step 1: Configure Email Settings

Edit `src/config/development.env`:

```env
# Email Configuration (Gmail Example)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_16_char_app_password
EMAIL_FROM_NAME=Online Shopping Dev

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
```

### Step 2: Get Gmail App Password

1. Go to Google Account → Security
2. Enable 2-Factor Authentication
3. Go to App Passwords
4. Create new app password for "Mail"
5. Copy the 16-character password
6. Paste into `EMAIL_PASSWORD`

### Step 3: Test It!

```bash
# Start server
npm start

# Register a new user
POST http://localhost:3000/api/v1/auth/register
Body:
{
  "username": "testuser",
  "email": "your_email@gmail.com",
  "password": "password123"
}

# Check your email for verification link!
```

---

## 📋 API Flow

### Registration Flow
```
1. POST /api/v1/auth/register
   → User created (isEmailVerified: false)
   → Verification email sent
   → Returns success message

2. User checks email
   → Clicks verification link
   
3. GET /api/v1/auth/verify-email/{token}
   → Email verified (isEmailVerified: true)
   → Welcome email sent
   → Redirects to frontend

4. POST /api/v1/auth/login
   → Now allowed to login ✅
```

### Login Protection
```
POST /api/v1/auth/login

IF isEmailVerified === false:
  ❌ Error: "Please verify your email..."
  
IF isEmailVerified === true:
  ✅ Success: Returns access & refresh tokens
```

---

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/register` | Register + Send verification email |
| `GET` | `/api/v1/auth/verify-email/:token` | Verify email with token |
| `POST` | `/api/v1/auth/resend-verification` | Resend verification email |
| `POST` | `/api/v1/auth/login` | Login (requires verified email) |

---

## 📧 Email Templates

### Verification Email
- ✅ Beautiful gradient design
- ✅ Clear call-to-action button
- ✅ Expiry warning (24 hours)
- ✅ Mobile responsive
- ✅ Fallback text link

### Welcome Email
- ✅ Sent after successful verification
- ✅ Feature highlights
- ✅ Next steps guide
- ✅ Professional design

---

## 🧪 Testing Examples

### 1. Register User
```bash
POST http://localhost:3000/api/v1/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123"
}

# Response:
{
  "msg": "User registered",
  "user": {
    "isEmailVerified": false,
    "message": "Registration successful! Please check your email to verify your account."
  }
}
```

### 2. Try Login (Before Verification)
```bash
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

# Response:
{
  "msg": "Please verify your email before logging in. Check your inbox for the verification link."
}
```

### 3. Verify Email
```bash
# Option A: Click link in email (redirects to frontend)
GET http://localhost:3000/api/v1/auth/verify-email/YOUR_TOKEN

# Option B: API call (returns JSON)
GET http://localhost:3000/api/v1/auth/verify-email/YOUR_TOKEN?redirect=false

# Response:
{
  "success": true,
  "message": "Email verified successfully! You can now log in.",
  "user": {
    "isEmailVerified": true
  }
}
```

### 4. Login (After Verification)
```bash
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

# Response:
{
  "msg": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": {
    "isEmailVerified": true
  }
}
```

### 5. Resend Verification
```bash
POST http://localhost:3000/api/v1/auth/resend-verification
Content-Type: application/json

{
  "email": "john@example.com"
}

# Response:
{
  "success": true,
  "message": "Verification email sent! Please check your inbox."
}
```

---

## ⚙️ Email Provider Options

### Option 1: Gmail (Recommended for Testing)
```env
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=app_password_16_chars
```

### Option 2: Custom SMTP
```env
EMAIL_SERVICE=smtp
EMAIL_HOST=smtp.yourdomain.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=your_password
```

### Option 3: SendGrid, Mailgun, etc.
```env
EMAIL_SERVICE=smtp
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your_sendgrid_api_key
```

---

## 🐛 Common Issues

### Issue: Email Not Sending
**Solution:**
- Check EMAIL_USER and EMAIL_PASSWORD
- For Gmail: Use App Password (not regular password)
- Check console logs for errors

### Issue: "Invalid or expired token"
**Solution:**
- Token expires after 24 hours
- Use resend verification endpoint
- Generate new token

### Issue: Login Still Blocked
**Solution:**
- Verify email first
- Check `isEmailVerified` field in database
- Token must be valid and not expired

---

## 📚 Documentation

- **Full Guide:** [`EMAIL_VERIFICATION_GUIDE.md`](EMAIL_VERIFICATION_GUIDE.md)
- **Swagger Docs:** http://localhost:3000/api-docs
- **Frontend Examples:** See full guide for React components

---

## ✨ Features Overview

| Feature | Status |
|---------|--------|
| Email verification required | ✅ |
| Verification email sent on register | ✅ |
| Login blocked until verified | ✅ |
| Beautiful HTML email templates | ✅ |
| Token expiration (24 hours) | ✅ |
| Resend verification email | ✅ |
| Welcome email after verification | ✅ |
| Frontend redirect support | ✅ |
| Swagger documentation | ✅ |
| Multiple email provider support | ✅ |

---

## 🎯 Next Steps

1. ✅ Configure email settings in `.env`
2. ✅ Get Gmail App Password
3. ✅ Test registration flow
4. ✅ Check email inbox
5. ✅ Click verification link
6. ✅ Test login
7. ✅ Integrate with frontend

---

**Status:** ✅ Ready to Use  
**Last Updated:** 2025-10-18  
**Version:** 1.0.0

**Need Help?** See [`EMAIL_VERIFICATION_GUIDE.md`](EMAIL_VERIFICATION_GUIDE.md) for detailed documentation!
