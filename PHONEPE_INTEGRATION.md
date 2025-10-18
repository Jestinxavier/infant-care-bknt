# PhonePe Payment Gateway Integration Guide

## 📋 Overview
This document explains how to integrate and use PhonePe payment gateway in your online shopping backend.

## 🚀 Setup Instructions

### 1. Install Dependencies
Already installed: `axios` for making HTTP requests to PhonePe API.

### 2. Get PhonePe Credentials

#### For Testing (Sandbox):
1. Visit: https://business.phonepe.com/
2. Sign up for a merchant account
3. Go to Developer Dashboard
4. Get your credentials:
   - **Merchant ID**
   - **Salt Key**
   - **Salt Index**

#### For Production:
1. Complete KYC verification
2. Get production credentials from PhonePe dashboard

### 3. Configure Environment Variables

Add these to your `.env` file:

```env
# PhonePe Configuration
PHONEPE_MERCHANT_ID=your_merchant_id_here
PHONEPE_SALT_KEY=your_salt_key_here
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:5000/api/v1/payments/phonepe/callback
```

**Important URLs:**
- `PHONEPE_REDIRECT_URL`: Your **frontend** URL where users are redirected after payment
- `PHONEPE_CALLBACK_URL`: Your **backend** URL where PhonePe sends payment status

## 🔄 Payment Flow

### Complete Payment Flow Diagram

```
1. User places order → Create Order API
2. Order created with "pending" payment status
3. Frontend calls PhonePe Init API with orderId
4. Backend generates PhonePe payment URL
5. User redirected to PhonePe payment page
6. User completes payment on PhonePe
7. PhonePe sends callback to backend (webhook)
8. Backend updates payment & order status
9. User redirected back to frontend
10. Frontend shows success/failure message
```

## 📡 API Endpoints

### 1. Create Order (Existing - Modified)
**Endpoint:** `POST /api/v1/orders/create`

**Request Body:**
```json
{
  "userId": "64abc123def456789",
  "items": [
    {
      "variantId": "64abc123def456790",
      "quantity": 2
    }
  ],
  "addressId": "64abc123def456791",
  "paymentMethod": "PhonePe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "✅ Order created successfully. Please initiate PhonePe payment.",
  "order": {
    "_id": "64abc123def456792",
    "totalAmount": 1500,
    "paymentStatus": "pending"
  },
  "payment": {
    "_id": "64abc123def456793",
    "status": "pending"
  },
  "requiresPayment": true,
  "paymentMethod": "PhonePe"
}
```

### 2. Initialize PhonePe Payment
**Endpoint:** `POST /api/v1/payments/phonepe/init`

**Request Body:**
```json
{
  "orderId": "64abc123def456792",
  "amount": 1500,
  "userId": "64abc123def456789",
  "userPhone": "9876543210",
  "userName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "paymentUrl": "https://mercury-uat.phonepe.com/transact/pg?token=...",
    "transactionId": "TXN_64abc123def456792_1234567890",
    "orderId": "64abc123def456792"
  }
}
```

**Frontend Action:** Redirect user to `paymentUrl`

### 3. PhonePe Callback (Webhook)
**Endpoint:** `POST /api/v1/payments/phonepe/callback`

This endpoint is called automatically by PhonePe. You don't need to call it manually.

**What it does:**
- Receives payment status from PhonePe
- Updates payment record
- Updates order payment status
- Marks payment as success/failed

### 4. Check Payment Status
**Endpoint:** `GET /api/v1/payments/phonepe/status/:transactionId`

**Example:**
```
GET /api/v1/payments/phonepe/status/TXN_64abc123def456792_1234567890
```

**Response:**
```json
{
  "success": true,
  "message": "Payment status retrieved",
  "data": {
    "state": "COMPLETED",
    "responseCode": "SUCCESS",
    "amount": 150000
  }
}
```

## 💻 Frontend Integration Example

### React/JavaScript Example

```javascript
// Step 1: Create Order
const createOrder = async (orderData) => {
  const response = await fetch('http://localhost:5000/api/v1/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...orderData,
      paymentMethod: 'PhonePe'
    })
  });
  
  const result = await response.json();
  
  if (result.requiresPayment && result.paymentMethod === 'PhonePe') {
    // Order created, now initiate payment
    initiatePhonePePayment(result.order);
  }
};

// Step 2: Initiate PhonePe Payment
const initiatePhonePePayment = async (order) => {
  const response = await fetch('http://localhost:5000/api/v1/payments/phonepe/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: order._id,
      amount: order.totalAmount,
      userId: order.userId,
      userPhone: '9876543210',
      userName: 'John Doe'
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Redirect to PhonePe payment page
    window.location.href = result.data.paymentUrl;
  }
};

// Step 3: Handle Callback (on your frontend callback page)
const PaymentCallback = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  
  // Fetch order status to confirm payment
  useEffect(() => {
    fetchOrderStatus(orderId);
  }, []);
  
  return <div>Processing payment...</div>;
};

// Step 4: Verify Payment Status
const fetchOrderStatus = async (orderId) => {
  const response = await fetch(`http://localhost:5000/api/v1/orders/${orderId}`);
  const order = await response.json();
  
  if (order.paymentStatus === 'paid') {
    // Show success message
    alert('Payment successful!');
  } else {
    // Show failure message
    alert('Payment failed!');
  }
};
```

## 🧪 Testing

### Test with PhonePe Sandbox

1. Use sandbox credentials
2. Set `PHONEPE_ENV=development`
3. PhonePe provides test card numbers for sandbox testing

### Test Cards (Sandbox):
- **Success:** Use any valid test card from PhonePe sandbox
- **Failure:** Trigger by specific test scenarios

## 🔒 Security Notes

1. **Never expose Salt Key** in frontend code
2. **Verify checksums** on callbacks
3. **Use HTTPS** in production
4. **Validate amount** before payment
5. **Store transaction IDs** for reconciliation

## 📊 Database Updates

### Order Model
- Added `"PhonePe"` to `paymentMethod` enum

### Payment Model
- Added `"PhonePe"` to `method` enum
- Added `phonepeTransactionId` field
- Added `phonepeResponse` field (stores complete PhonePe response)

## 🛠️ Troubleshooting

### Common Issues:

1. **Payment Init Failed**
   - Check merchant credentials
   - Verify API endpoint (sandbox vs production)
   - Check amount (must be in paise - multiply by 100)

2. **Callback Not Received**
   - Ensure callback URL is publicly accessible
   - Check if server is running
   - Verify firewall settings

3. **Checksum Validation Failed**
   - Verify salt key is correct
   - Check salt index
   - Ensure proper encoding

4. **Amount Mismatch**
   - PhonePe requires amount in **paise** (smallest currency unit)
   - Backend converts: `amount * 100`
   - ₹100 = 10000 paise

## 📞 Support

- **PhonePe Docs:** https://developer.phonepe.com/
- **PhonePe Support:** support@phonepe.com
- **Merchant Dashboard:** https://business.phonepe.com/

## 🎯 Next Steps

1. ✅ Get PhonePe merchant credentials
2. ✅ Add environment variables
3. ✅ Test in sandbox environment
4. ✅ Integrate frontend
5. ✅ Test complete flow
6. ✅ Move to production

---

**Happy Coding! 🚀**
