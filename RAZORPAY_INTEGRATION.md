# 💳 Razorpay Payment Gateway Integration Guide

Complete guide to integrate Razorpay payment gateway in your online shopping backend.

---

## 📋 Table of Contents

1. [Getting Razorpay Credentials](#-getting-razorpay-credentials)
2. [Configuration](#-configuration)
3. [How It Works](#-how-it-works)
4. [API Endpoints](#-api-endpoints)
5. [Frontend Integration](#-frontend-integration)
6. [Testing](#-testing)
7. [Production Checklist](#-production-checklist)

---

## 🔑 Getting Razorpay Credentials

### Step 1: Sign Up

**Visit:** https://dashboard.razorpay.com/signup

1. Click "Sign Up"
2. Enter business email
3. Verify email
4. Complete registration

### Step 2: Get API Keys

1. **Login to Dashboard:** https://dashboard.razorpay.com
2. **Navigate to Settings:**
   ```
   Dashboard → Settings → API Keys
   ```
3. **Generate Keys:**
   - Click "Generate Test Keys" (for testing)
   - Click "Generate Live Keys" (for production, after KYC)

4. **Copy Credentials:**
   - **Key ID:** `rzp_test_xxxxxxxxxxxxx`
   - **Key Secret:** `xxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Webhook Secret (Optional)

For webhook verification:
1. Go to: Settings → Webhooks
2. Create webhook endpoint
3. Copy Webhook Secret

---

## ⚙️ Configuration

### Environment Variables

Add to your `.env` file:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
RAZORPAY_CURRENCY=INR

# Test Mode (use test keys)
# Production Mode (use live keys after KYC)
```

### Test vs Live Keys

**Test Keys (Sandbox):**
```
Key ID: rzp_test_xxxxxxxxxxxxx
Key Secret: xxxxxxxxxxxxxxxxxxxxxxxx
```

**Live Keys (Production):**
```
Key ID: rzp_live_xxxxxxxxxxxxx
Key Secret: xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🔄 How It Works

### Payment Flow Diagram

```
User → Checkout
       ↓
1. Create Order (Backend)
   POST /api/v1/orders/create
   paymentMethod: "Razorpay"
       ↓
2. Create Razorpay Order (Backend)
   POST /api/v1/payments/razorpay/create-order
   Returns: { razorpayOrderId, keyId }
       ↓
3. Open Razorpay Checkout (Frontend)
   Razorpay.open({ order_id, key })
       ↓
4. User Pays on Razorpay Modal
       ↓
5. Payment Success Callback (Frontend)
   Receives: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
       ↓
6. Verify Payment (Backend)
   POST /api/v1/payments/razorpay/verify
       ↓
7. Payment Verified
   Order status → "paid"
       ↓
8. Show Success Page
```

---

## 📡 API Endpoints

### 1. Create Razorpay Order

**Endpoint:** `POST /api/v1/payments/razorpay/create-order`

**Request:**
```json
{
  "orderId": "64abc123def456792",
  "amount": 1500,
  "userId": "64abc123def456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Razorpay order created successfully",
  "data": {
    "razorpayOrderId": "order_xxxxxxxxxxxxx",
    "amount": 150000,
    "currency": "INR",
    "orderId": "64abc123def456792",
    "keyId": "rzp_test_xxxxx"
  }
}
```

### 2. Verify Payment

**Endpoint:** `POST /api/v1/payments/razorpay/verify`

**Request:**
```json
{
  "razorpay_order_id": "order_xxxxxxxxxxxxx",
  "razorpay_payment_id": "pay_xxxxxxxxxxxxx",
  "razorpay_signature": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "orderId": "64abc123def456792"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "paymentId": "64abc123def456793",
  "orderId": "64abc123def456792"
}
```

### 3. Webhook (Automatic)

**Endpoint:** `POST /api/v1/payments/razorpay/webhook`

Razorpay automatically sends payment events to this endpoint.

### 4. Get Payment Details

**Endpoint:** `GET /api/v1/payments/razorpay/payment/:paymentId`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "pay_xxxxxxxxxxxxx",
    "amount": 150000,
    "currency": "INR",
    "status": "captured",
    "method": "card"
  }
}
```

---

## 💻 Frontend Integration

### Next.js Complete Example

```javascript
// lib/razorpay.js
export const initiateRazorpayPayment = async (orderData) => {
  try {
    // Step 1: Create backend order
    const orderResponse = await fetch('/api/v1/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderData,
        paymentMethod: 'Razorpay'
      })
    });

    const orderResult = await orderResponse.json();
    const { order } = orderResult;

    // Step 2: Create Razorpay order
    const razorpayResponse = await fetch('/api/v1/payments/razorpay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order._id,
        amount: order.totalAmount,
        userId: order.userId
      })
    });

    const razorpayResult = await razorpayResponse.json();
    const { razorpayOrderId, keyId } = razorpayResult.data;

    // Step 3: Open Razorpay Checkout
    const options = {
      key: keyId,
      amount: order.totalAmount * 100,
      currency: 'INR',
      name: 'Your Store Name',
      description: 'Order Payment',
      order_id: razorpayOrderId,
      handler: async function (response) {
        // Step 4: Verify payment
        await verifyPayment(response, order._id);
      },
      prefill: {
        name: 'Customer Name',
        email: 'customer@example.com',
        contact: '9876543210'
      },
      theme: {
        color: '#5f259f'
      }
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();

  } catch (error) {
    console.error('Payment error:', error);
  }
};

// Verify payment
const verifyPayment = async (razorpayResponse, orderId) => {
  try {
    const response = await fetch('/api/v1/payments/razorpay/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature,
        orderId: orderId
      })
    });

    const result = await response.json();

    if (result.success) {
      // Payment successful - redirect to success page
      window.location.href = `/order/success?orderId=${orderId}`;
    } else {
      // Payment verification failed
      alert('Payment verification failed');
    }

  } catch (error) {
    console.error('Verification error:', error);
  }
};
```

### Add Razorpay Script

In your `_app.js` or `layout.js`:

```javascript
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Checkout Component

```javascript
// components/RazorpayCheckout.jsx
'use client';

import { initiateRazorpayPayment } from '@/lib/razorpay';

export default function RazorpayCheckout({ cart, userId, addressId }) {
  const handleRazorpayPayment = () => {
    const orderData = {
      userId: userId,
      items: cart.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity
      })),
      addressId: addressId,
      paymentMethod: 'Razorpay'
    };

    initiateRazorpayPayment(orderData);
  };

  return (
    <button onClick={handleRazorpayPayment} className="razorpay-btn">
      Pay with Razorpay
    </button>
  );
}
```

---

## 🧪 Testing

### Test Cards

Razorpay provides test cards for sandbox:

**Success:**
- Card: `4111 1111 1111 1111`
- CVV: Any 3 digits
- Expiry: Any future date

**Failure:**
- Card: `4000 0000 0000 0002`

**Other Test Methods:**
- UPI: `success@razorpay`
- Netbanking: Use any test bank
- Wallets: All test wallets work

### Testing Webhook

Use ngrok for local testing:

```bash
ngrok http 3000

# Update webhook URL in Razorpay Dashboard:
https://your-ngrok-url.ngrok.io/api/v1/payments/razorpay/webhook
```

---

## ✅ Production Checklist

Before going live:

- [ ] KYC completed on Razorpay
- [ ] Live API keys generated
- [ ] Updated environment variables with live keys
- [ ] Webhook URL configured (HTTPS)
- [ ] Tested complete payment flow
- [ ] Error handling implemented
- [ ] Payment failure scenarios handled
- [ ] Refund process documented
- [ ] Compliance with regulations

---

## 🔐 Security Best Practices

1. **Never expose Key Secret:**
   - Keep in backend `.env` only
   - Never send to frontend

2. **Always verify signatures:**
   - Verify payment signature on backend
   - Don't trust frontend responses alone

3. **Use HTTPS in production:**
   - Razorpay requires HTTPS for webhooks
   - Secure all payment endpoints

4. **Validate amounts:**
   - Verify amount matches on backend
   - Don't trust frontend amount

---

## 🆘 Troubleshooting

### Issue: Payment not captured

**Solution:** Check Razorpay dashboard for payment status

### Issue: Webhook not received

**Solution:**
- Ensure webhook URL is public/accessible
- Check webhook secret is correct
- Use ngrok for local testing

### Issue: Signature verification failed

**Solution:**
- Verify Key Secret is correct
- Check order_id and payment_id match
- Ensure no extra spaces in credentials

---

## 📞 Support

- **Razorpay Docs:** https://razorpay.com/docs/
- **Dashboard:** https://dashboard.razorpay.com/
- **Support:** https://razorpay.com/support/

---

**Your Razorpay integration is ready!** 🎉

For Next.js examples, see: [NEXTJS_RAZORPAY_INTEGRATION.md](./NEXTJS_RAZORPAY_INTEGRATION.md)
