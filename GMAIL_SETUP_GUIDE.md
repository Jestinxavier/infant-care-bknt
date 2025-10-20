# 📧 Gmail Email Configuration Guide

## 🔴 Common Error Fixed

**Error Message:**
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```

**Cause:** Gmail App Password had spaces in it  
**Solution:** ✅ Remove all spaces from the App Password

---

## 📋 Gmail Setup Instructions

### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security** in the left menu
3. Under "Signing in to Google," enable **2-Step Verification**
4. Follow the setup wizard to enable 2FA

⚠️ **Important:** You MUST enable 2FA before creating App Passwords

---

### Step 2: Generate App Password

1. Go to: https://myaccount.google.com/apppasswords
   - Or: Google Account → Security → 2-Step Verification → App passwords

2. Click **Select app** → Choose "Mail" or "Other (Custom name)"

3. Enter app name: `Online Shopping Backend`

4. Click **Generate**

5. Google will show a 16-character password like:
   ```
   abcd efgh ijkl mnop
   ```

6. **IMPORTANT:** Copy it and **remove all spaces**:
   ```
   abcdefghijklmnop
   ```

---

### Step 3: Update .env File

Open your `.env` file and update the email configuration:

```env
# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop    # ← NO SPACES!
EMAIL_FROM_NAME=Online Shopping
```

**Critical Rules:**
- ✅ Remove ALL spaces from the App Password
- ✅ Use the App Password, NOT your regular Gmail password
- ✅ Do NOT use quotes around the password
- ✅ Use the full email address for EMAIL_USER

---

### Step 4: Restart Your Server

After updating the `.env` file:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

---

## ✅ Verification Checklist

Before testing, verify:

- [ ] 2-Factor Authentication is enabled on your Google Account
- [ ] App Password is generated from Google Account settings
- [ ] App Password is copied WITHOUT spaces
- [ ] `.env` file has correct EMAIL_USER (full email address)
- [ ] `.env` file has correct EMAIL_PASSWORD (no spaces)
- [ ] Server has been restarted after updating `.env`

---

## 🧪 Test Email Sending

### Test with Registration API

```bash
# Test OTP email
curl -X POST http://localhost:3000/api/v1/auth/register/request-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "Test123456"
  }'
```

### Expected Console Output

If successful, you should see:

```
✅ OTP email sent: <message-id>
```

If failed, you'll see:

```
❌ Error sending OTP email: [error details]
```

---

## 🔧 Troubleshooting

### Error: "Invalid login: 535-5.7.8"

**Solutions:**
1. **Remove spaces from App Password**
   ```env
   # ❌ Wrong
   EMAIL_PASSWORD=alhp waxt sxkg oawb
   
   # ✅ Correct
   EMAIL_PASSWORD=alhpwaxtsxkgoawb
   ```

2. **Verify you're using App Password, not regular password**
   - App Password: 16 characters
   - Regular password: Your normal Gmail password won't work

3. **Check 2FA is enabled**
   - Visit: https://myaccount.google.com/security
   - Verify "2-Step Verification" is ON

### Error: "EAUTH: Authentication failed"

**Solutions:**
1. Regenerate a new App Password
2. Make sure EMAIL_USER matches the Google Account
3. Verify no typos in EMAIL_USER or EMAIL_PASSWORD

### Error: "ECONNREFUSED"

**Solutions:**
1. Check internet connection
2. Verify EMAIL_HOST is `smtp.gmail.com`
3. Verify EMAIL_PORT is `587`
4. Make sure EMAIL_SECURE is `false` for port 587

---

## 🔐 Security Best Practices

### 1. Never Commit .env to Git

Your `.gitignore` should include:
```
.env
.env.*
*.env
```

### 2. Use Different Credentials for Production

```env
# Development .env
EMAIL_USER=dev@example.com
EMAIL_PASSWORD=dev_app_password

# Production .env
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=prod_app_password
```

### 3. Rotate App Passwords Regularly

- Revoke old App Passwords: https://myaccount.google.com/apppasswords
- Generate new ones every 3-6 months

### 4. Monitor Email Activity

- Check Gmail's "Recent security activity": https://myaccount.google.com/notifications
- Review sent emails from your app

---

## 📊 Email Configuration Reference

### Gmail Settings

| Setting | Value | Notes |
|---------|-------|-------|
| EMAIL_SERVICE | `gmail` | Use Gmail service |
| EMAIL_HOST | `smtp.gmail.com` | Gmail SMTP server |
| EMAIL_PORT | `587` | TLS port (recommended) |
| EMAIL_SECURE | `false` | Use STARTTLS |
| EMAIL_USER | Your Gmail address | Full email required |
| EMAIL_PASSWORD | App Password | 16 chars, no spaces |

### Alternative: Port 465 (SSL)

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
```

---

## 🌟 Alternative Email Providers

If you need more reliability or higher sending limits:

### SendGrid (Recommended for Production)

```env
EMAIL_SERVICE=sendgrid
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your_sendgrid_api_key
```

### AWS SES

```env
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USER=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
```

### Mailgun

```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@yourdomain.mailgun.org
EMAIL_PASSWORD=your_mailgun_smtp_password
```

---

## 📧 Gmail Sending Limits

**Free Gmail Account:**
- 500 emails per day
- 500 recipients per email
- Rate limit: ~2 emails per second

**Google Workspace:**
- 2,000 emails per day
- Higher rate limits

For high-volume applications, consider dedicated email services like SendGrid, AWS SES, or Mailgun.

---

## 🚀 Production Recommendations

1. **Use a dedicated email service** (SendGrid, AWS SES, Mailgun)
2. **Set up SPF and DKIM records** for better deliverability
3. **Use a custom domain** instead of Gmail
4. **Implement email queue** for better reliability
5. **Monitor bounce rates** and failed deliveries

---

## 📚 Related Documentation

- [EMAIL_VERIFICATION_GUIDE.md](EMAIL_VERIFICATION_GUIDE.md) - OTP verification flow
- [EMAIL_SETUP_QUICK_START.md](EMAIL_SETUP_QUICK_START.md) - Quick email setup
- [.env.example](.env.example) - Environment variables template

---

## ✅ Quick Fix Summary

Your issue is fixed! The problem was:

```env
# ❌ Before (with spaces)
EMAIL_PASSWORD=alhp waxt sxkg oawb

# ✅ After (without spaces)
EMAIL_PASSWORD=alhpwaxtsxkgoawb
```

Restart your server and try sending OTP again. It should work now! 🎉

---

**Last Updated:** 2025-10-20  
**Status:** ✅ Issue Resolved
