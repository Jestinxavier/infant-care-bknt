# 🚀 PhonePe Integration - Quick Start Guide

## ⚡ Get Started in 5 Minutes

### Step 1: Install Dependencies ✅
Already done! `axios` has been installed.

### Step 2: Get PhonePe Credentials 🔑

1. Go to: https://business.phonepe.com/
2. Sign up / Login
3. Navigate to Developer Dashboard
4. Copy your credentials:
   - Merchant ID
   - Salt Key
   - Salt Index

### Step 3: Configure Environment Variables 📝

Create/update your `.env` file with:

```env
# PhonePe Sandbox Configuration
PHONEPE_MERCHANT_ID=PGTESTPAYUAT
PHONEPE_SALT_KEY=099eb0cd-02cf-4e2a-8aca-3e6c6aff0399
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development

# URLs (update based on your setup)
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:5000/api/v1/payments/phonepe/callback
```

**Note:** The above are example sandbox credentials. Replace with your actual credentials!

### Step 4: Start Your Server 🖥️

```bash
npm run dev
```

### Step 5: Test the Integration 🧪

#### Option A: Using Postman
1. Import `PhonePe_API_Collection.postman.json`
2. Update variables (userId, variantId, addressId)
3. Run requests in sequence

#### Option B: Using cURL

**1. Create Order:**
```bash
curl -X POST http://localhost:5000/api/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "items": [{"variantId": "YOUR_VARIANT_ID", "quantity": 1}],
    "addressId": "YOUR_ADDRESS_ID",
    "paymentMethod": "PhonePe"
  }'
```

**2. Initialize Payment:**
```bash
curl -X POST http://localhost:5000/api/v1/payments/phonepe/init \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID_FROM_STEP_1",
    "amount": 100,
    "userId": "YOUR_USER_ID",
    "userPhone": "9876543210"
  }'
```

**3. Open Payment URL:**
Copy the `paymentUrl` from response and open in browser.

---

## 📁 What's Been Added?

### New Files:
```
src/
├── config/
│   └── phonepe.js                    # PhonePe config & checksum utils
├── controllers/
│   └── payment/
│       ├── phonePeController.js      # Payment logic
│       └── index.js                  # Exports
└── routes/
    └── paymentRoutes.js              # Payment API routes

Documentation/
├── PHONEPE_INTEGRATION.md            # Complete guide
├── PHONEPE_TESTING_GUIDE.md          # Testing steps
├── PHONEPE_FLOW_DIAGRAM.md           # Visual flow
├── INTEGRATION_SUMMARY.md            # Summary of changes
├── .env.phonepe.example              # Env template
└── PhonePe_API_Collection.postman.json  # Postman tests
```

### Modified Files:
- `src/models/Order.js` - Added PhonePe to payment methods
- `src/models/Payment.js` - Added PhonePe fields
- `src/controllers/Order/orderController.js` - PhonePe support
- `src/app.js` - Added payment routes
- `package.json` - Added axios

---

## 🎯 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/orders/create` | POST | Create order |
| `/api/v1/payments/phonepe/init` | POST | Start payment |
| `/api/v1/payments/phonepe/callback` | POST | Webhook (auto) |
| `/api/v1/payments/phonepe/status/:txnId` | GET | Check status |

---

## 🔍 Quick Test Checklist

- [ ] Server running
- [ ] MongoDB connected
- [ ] Environment variables set
- [ ] Create order with PhonePe ✓
- [ ] Initialize payment ✓
- [ ] Get payment URL ✓
- [ ] Open payment page ✓
- [ ] Complete test payment ✓
- [ ] Verify order status updated ✓

---

## 📱 Frontend Integration

```javascript
// 1. Create order
const createOrder = async () => {
  const res = await fetch('/api/v1/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'USER_ID',
      items: [{ variantId: 'VAR_ID', quantity: 1 }],
      addressId: 'ADDR_ID',
      paymentMethod: 'PhonePe'
    })
  });
  return res.json();
};

// 2. Initialize payment
const initPayment = async (orderId, amount, userId) => {
  const res = await fetch('/api/v1/payments/phonepe/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      amount,
      userId,
      userPhone: '9876543210'
    })
  });
  return res.json();
};

// 3. Complete flow
const checkout = async () => {
  // Create order
  const order = await createOrder();
  
  // Init payment
  const payment = await initPayment(
    order.order._id,
    order.order.totalAmount,
    order.order.userId
  );
  
  // Redirect to PhonePe
  window.location.href = payment.data.paymentUrl;
};
```

---

## 🆘 Common Issues & Solutions

### Issue: "Invalid Merchant ID"
**Fix:** Check `PHONEPE_MERCHANT_ID` in .env

### Issue: "Callback not received"
**Fix:** Use ngrok for local testing:
```bash
ngrok http 5000
# Update PHONEPE_CALLBACK_URL with ngrok URL
```

### Issue: "Payment URL not working"
**Fix:** Verify `PHONEPE_ENV=development` for sandbox

### Issue: "Amount error"
**Fix:** Amount is auto-converted to paise (×100). Send in rupees.

---

## 📚 Full Documentation

For detailed information, check:

1. **Integration Guide:** `PHONEPE_INTEGRATION.md`
2. **Testing Guide:** `PHONEPE_TESTING_GUIDE.md`
3. **Flow Diagram:** `PHONEPE_FLOW_DIAGRAM.md`
4. **Summary:** `INTEGRATION_SUMMARY.md`

---

## 🎉 You're All Set!

PhonePe integration is complete and ready to use. Just add your credentials and start testing!

**Need help?** Check the documentation files or PhonePe developer docs.

**Happy Coding! 🚀**
