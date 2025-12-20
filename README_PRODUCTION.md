# 🚀 Production Deployment Checklist

This document outlines the critical steps and configurations required to transition from **Sandbox/Development** to **Production** for the Infant Care backend.

---

## 1. PhonePe Payment Gateway
To go live, you must replace your test credentials with production ones obtained from the [PhonePe Dashboard](https://dashboard.phonepe.com/).

### `.env` Updates
| Variable | Value for Production |
| :--- | :--- |
| `PHONEPE_ENV` | `production` |
| `PHONEPE_MERCHANT_ID` | Your Live Merchant ID (MID) |
| `PHONEPE_SALT_KEY` | Your Live Salt Key (NOT the 9643... test key) |
| `PHONEPE_SALT_INDEX` | 1 (or as provided in dashboard) |
| `PHONEPE_CALLBACK_URL` | `https://yourdomain.com/api/v1/payments/phonepe/callback` |
| `PHONEPE_REDIRECT_URL` | `https://yourdomain.com/account/orders` |

> [!IMPORTANT]
> **HTTPS is Required**: PhonePe will not send callbacks to `http` URLs in production. Ensure your site has a valid SSL certificate.

---

## 2. MongoDB Atlas Stability
If you are using MongoDB Atlas, ensure the following to avoid `ECONNRESET` errors:

1.  **IP Whitelisting**: Go to Network Access in Atlas and add your production server's IP address. For testing, you can use `0.0.0.0/0`, but for production, use specific IPs.
2.  **Connection String**: Double check that `MONGODB_URI` is correctly set in your production environment.
3.  **Retry Logic**: The current code includes a 5-attempt retry mechanism, which is good for stability.

---

## 3. CORS & Security
Ensure your backend only allows requests from your production frontend.

- Update `ALLOWED_ORIGINS` in your production environment to include `https://yourdomain.com`.
- Ensure `NODE_ENV` is set to `production` so that debug logs and detailed error responses are disabled.

---

## 4. Cloudinary & Razorpay
If you are also using these services in production:
- Ensure `CLOUDINARY_URL` is set correctly.
- Ensure `RAZORPAY_KEY_ID` and `RAZORPAY_SECRET` are production-ready.

---

## 5. Port Configuration
- Set `PORT` to the port expected by your hosting provider (usually `80` or `443` internally, or environment-provided).
- Ensure `BACKEND_URL` in `.env` reflects your live API domain.

---

## 🏗️ Pre-Launch Test Command
Run the following after setting production variables to verify connectivity:
```bash
npm run dev
```
Check the logs for:
- `✅ MongoDB Connected`
- `✅ Cloudinary ping success`
- `📱 PhonePe V1 (Manual) Configured: { env: 'PRODUCTION' ... }`
