# PhonePe Payment Testing Guide

## 🧪 Complete Testing Flow

### Prerequisites
1. MongoDB running
2. Server running on port 5000 (or your configured port)
3. PhonePe sandbox credentials added to `.env`

---

## 📝 Step-by-Step Testing

### Step 1: Create an Order with PhonePe Payment

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "items": [
      {
        "variantId": "YOUR_VARIANT_ID",
        "quantity": 2
      }
    ],
    "addressId": "YOUR_ADDRESS_ID",
    "paymentMethod": "PhonePe"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "✅ Order created successfully. Please initiate PhonePe payment.",
  "order": {
    "_id": "ORDER_ID_HERE",
    "userId": "...",
    "totalAmount": 1500,
    "paymentStatus": "pending",
    "orderStatus": "processing"
  },
  "payment": {
    "_id": "PAYMENT_ID_HERE",
    "status": "pending",
    "method": "PhonePe"
  },
  "requiresPayment": true,
  "paymentMethod": "PhonePe"
}
```

**Note the `order._id` - you'll need it for the next step!**

---

### Step 2: Initialize PhonePe Payment

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/payments/phonepe/init \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID_FROM_STEP_1",
    "amount": 1500,
    "userId": "YOUR_USER_ID",
    "userPhone": "9876543210",
    "userName": "Test User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "paymentUrl": "https://mercury-uat.phonepe.com/transact/pg?token=XXXXX",
    "transactionId": "TXN_ORDER_ID_1234567890",
    "orderId": "ORDER_ID_FROM_STEP_1"
  }
}
```

**Action:** 
- Copy the `paymentUrl`
- Open it in browser
- Complete payment on PhonePe page

---

### Step 3: PhonePe Callback (Automatic)

After payment completion, PhonePe will automatically call:
```
POST http://localhost:5000/api/v1/payments/phonepe/callback
```

**This happens automatically - you don't need to call it!**

For testing callback locally, you'll need:
1. **ngrok** or similar tool to expose your local server
2. Update `PHONEPE_CALLBACK_URL` in `.env` with ngrok URL

Example with ngrok:
```bash
ngrok http 5000
# Use the ngrok URL: https://xxxx.ngrok.io/api/v1/payments/phonepe/callback
```

---

### Step 4: Check Payment Status (Manual Verification)

**Request:**
```bash
curl http://localhost:5000/api/v1/payments/phonepe/status/TRANSACTION_ID_FROM_STEP_2
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Payment status retrieved",
  "data": {
    "merchantId": "YOUR_MERCHANT_ID",
    "merchantTransactionId": "TXN_ORDER_ID_1234567890",
    "transactionId": "PHONEPE_TXN_ID",
    "amount": 150000,
    "state": "COMPLETED",
    "responseCode": "SUCCESS"
  }
}
```

---

## 🔍 Verify in Database

### Check Order Status
```javascript
// MongoDB Query
db.orders.findOne({ _id: ObjectId("YOUR_ORDER_ID") })

// Expected:
{
  paymentStatus: "paid",  // Should be "paid" if successful
  orderStatus: "processing"
}
```

### Check Payment Record
```javascript
// MongoDB Query
db.payments.findOne({ orderId: ObjectId("YOUR_ORDER_ID") })

// Expected:
{
  status: "success",  // Should be "success" if paid
  method: "PhonePe",
  transactionId: "TXN_...",
  phonepeTransactionId: "PHONEPE_TXN_ID",
  phonepeResponse: { /* Complete PhonePe response */ }
}
```

---

## 🚨 Common Testing Scenarios

### Scenario 1: Successful Payment
1. Create order ✅
2. Init payment ✅
3. Complete payment on PhonePe ✅
4. Callback received ✅
5. Order status = "paid" ✅

### Scenario 2: Failed Payment
1. Create order ✅
2. Init payment ✅
3. Cancel/fail payment on PhonePe ❌
4. Callback received ✅
5. Order status = "failed" ✅

### Scenario 3: Pending Payment (User didn't complete)
1. Create order ✅
2. Init payment ✅
3. User closes payment page ⏸️
4. No callback received
5. Order status = "pending" ⏸️
6. Use status check API to verify

---

## 🐛 Debugging Tips

### Enable Detailed Logs

Add this to your controller for debugging:

```javascript
// In phonePeController.js - initPhonePePayment function
console.log("📤 PhonePe Request Payload:", paymentPayload);
console.log("📤 Base64 Payload:", base64Payload);
console.log("📤 Checksum:", checksum);
console.log("📥 PhonePe Response:", response.data);
```

### Check Server Logs

When testing, watch your terminal for:
```
📞 PhonePe Callback received: { ... }
✅ Payment successful
❌ Payment failed
```

### Network Tab

Open browser DevTools > Network tab to see:
- API calls
- Response data
- Error messages

---

## 📊 Test Data (Sandbox)

### Test Phone Numbers
- Success: Any 10-digit number
- Failure: Check PhonePe sandbox documentation

### Test Amounts
- Minimum: ₹1 (100 paise)
- Maximum: ₹100,000 (10,000,000 paise)
- Testing: Use ₹10-₹100 for quick tests

---

## ✅ Checklist Before Going Live

- [ ] PhonePe merchant account verified
- [ ] KYC completed
- [ ] Production credentials obtained
- [ ] Environment variables updated
- [ ] `PHONEPE_ENV=production` set
- [ ] Callback URL is HTTPS
- [ ] All test scenarios passed
- [ ] Error handling tested
- [ ] Logs configured properly
- [ ] Transaction reconciliation process in place

---

## 🆘 Troubleshooting

### Issue: "Merchant ID invalid"
**Solution:** Double-check `PHONEPE_MERCHANT_ID` in `.env`

### Issue: "Checksum verification failed"
**Solution:** 
- Verify `PHONEPE_SALT_KEY`
- Ensure no extra spaces in `.env` file
- Check `PHONEPE_SALT_INDEX` (usually "1")

### Issue: "Callback not received"
**Solution:**
- Use ngrok for local testing
- Ensure callback URL is publicly accessible
- Check firewall settings

### Issue: "Amount mismatch"
**Solution:** 
- PhonePe expects amount in paise
- Backend automatically converts (amount * 100)
- Ensure you're sending rupees, not paise

### Issue: "Payment URL not opening"
**Solution:**
- Check PhonePe API endpoint (sandbox vs production)
- Verify merchant credentials
- Check PhonePe service status

---

**Happy Testing! 🎉**
