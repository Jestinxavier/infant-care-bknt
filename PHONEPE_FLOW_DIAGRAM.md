# PhonePe Payment Flow Diagram

## Complete Payment Flow

```
┌─────────────┐
│   User      │
│  (Frontend) │
└──────┬──────┘
       │
       │ 1. Create Order (paymentMethod: "PhonePe")
       │
       ▼
┌─────────────────────────────────────────┐
│  POST /api/v1/orders/create             │
│  └─ orderController.js                  │
│     • Validate items & calculate total  │
│     • Create Order (status: pending)    │
│     • Create Payment (status: pending)  │
│     • Return: requiresPayment = true    │
└──────┬──────────────────────────────────┘
       │
       │ Response: { order, requiresPayment: true }
       │
       ▼
┌─────────────┐
│  Frontend   │
│  Receives   │
│  Order ID   │
└──────┬──────┘
       │
       │ 2. Initialize PhonePe Payment
       │    (orderId, amount, userId, phone)
       │
       ▼
┌─────────────────────────────────────────┐
│  POST /api/v1/payments/phonepe/init     │
│  └─ phonePeController.js                │
│     • Generate transaction ID           │
│     • Create PhonePe payload            │
│     • Generate checksum (SHA256)        │
│     • Call PhonePe API                  │
│     • Update Payment with txn ID        │
│     • Return payment URL                │
└──────┬──────────────────────────────────┘
       │
       │ Response: { paymentUrl, transactionId }
       │
       ▼
┌─────────────┐
│  Frontend   │
│  Redirects  │
│  User to    │
│  PhonePe    │
└──────┬──────┘
       │
       │ 3. User on PhonePe Payment Page
       │
       ▼
┌─────────────────────────────────────────┐
│         PhonePe Payment Page            │
│  • User enters payment details          │
│  • UPI / Card / Wallet                  │
│  • Completes authentication             │
│  • Payment processed                    │
└──────┬──────────────────────────────────┘
       │
       │ 4. PhonePe sends callback
       │    (happens in parallel)
       │
       ▼
┌─────────────────────────────────────────┐
│  POST /api/v1/payments/phonepe/callback │
│  └─ phonePeController.js                │
│     • Decode response payload           │
│     • Validate checksum                 │
│     • Find Payment record               │
│     • Update Payment status             │
│     • Update Order.paymentStatus        │
│     • Log transaction details           │
└──────┬──────────────────────────────────┘
       │
       │ Meanwhile...
       │
       ▼
┌─────────────────────────────────────────┐
│         PhonePe Redirects User          │
│  → Frontend callback URL                │
│     http://localhost:3000/payment/      │
│     callback?orderId=XXX                │
└──────┬──────────────────────────────────┘
       │
       │ 5. User lands on frontend callback page
       │
       ▼
┌─────────────┐
│  Frontend   │
│  Callback   │
│  Page       │
└──────┬──────┘
       │
       │ 6. Verify payment status (optional)
       │
       ▼
┌─────────────────────────────────────────┐
│  GET /api/v1/payments/phonepe/status/   │
│      {transactionId}                    │
│  └─ phonePeController.js                │
│     • Call PhonePe status API           │
│     • Verify payment state              │
│     • Update local records              │
│     • Return status to frontend         │
└──────┬──────────────────────────────────┘
       │
       │ Response: { state: "COMPLETED", responseCode: "SUCCESS" }
       │
       ▼
┌─────────────┐
│  Frontend   │
│  Shows      │
│  Success /  │
│  Failure    │
│  Message    │
└─────────────┘
```

---

## Database State Changes

### Initial State (After Order Creation)
```
Order {
  _id: "ORDER_123",
  paymentStatus: "pending",
  orderStatus: "processing",
  paymentMethod: "PhonePe"
}

Payment {
  _id: "PAYMENT_123",
  orderId: "ORDER_123",
  status: "pending",
  method: "PhonePe",
  transactionId: null
}
```

### After Payment Init
```
Payment {
  _id: "PAYMENT_123",
  orderId: "ORDER_123",
  status: "pending",
  method: "PhonePe",
  transactionId: "TXN_ORDER_123_1234567890",  ← Added
  phonepeResponse: { ... }  ← Added
}
```

### After Successful Payment
```
Order {
  _id: "ORDER_123",
  paymentStatus: "paid",  ← Updated
  orderStatus: "processing"
}

Payment {
  _id: "PAYMENT_123",
  status: "success",  ← Updated
  transactionId: "TXN_ORDER_123_1234567890",
  phonepeTransactionId: "PH_987654321",  ← Added
  phonepeResponse: {  ← Updated with complete response
    state: "COMPLETED",
    responseCode: "SUCCESS"
  }
}
```

---

## API Request/Response Flow

### 1️⃣ Create Order Request
```http
POST /api/v1/orders/create
Content-Type: application/json

{
  "userId": "USER_123",
  "items": [{ "variantId": "VAR_456", "quantity": 2 }],
  "addressId": "ADDR_789",
  "paymentMethod": "PhonePe"
}
```

### 1️⃣ Create Order Response
```json
{
  "success": true,
  "order": { "_id": "ORDER_123", "totalAmount": 1500 },
  "payment": { "_id": "PAYMENT_123", "status": "pending" },
  "requiresPayment": true
}
```

### 2️⃣ Init Payment Request
```http
POST /api/v1/payments/phonepe/init
Content-Type: application/json

{
  "orderId": "ORDER_123",
  "amount": 1500,
  "userId": "USER_123",
  "userPhone": "9876543210"
}
```

### 2️⃣ Init Payment Response
```json
{
  "success": true,
  "data": {
    "paymentUrl": "https://mercury-uat.phonepe.com/...",
    "transactionId": "TXN_ORDER_123_1234567890"
  }
}
```

### 3️⃣ PhonePe Callback (Automatic)
```http
POST /api/v1/payments/phonepe/callback
Content-Type: application/json

{
  "response": "BASE64_ENCODED_RESPONSE_DATA"
}
```

### 4️⃣ Status Check Request
```http
GET /api/v1/payments/phonepe/status/TXN_ORDER_123_1234567890
```

### 4️⃣ Status Check Response
```json
{
  "success": true,
  "data": {
    "state": "COMPLETED",
    "responseCode": "SUCCESS",
    "amount": 150000
  }
}
```

---

## Security Flow

```
Backend generates payload
         ↓
Convert to Base64
         ↓
Create SHA256 hash
(payload + endpoint + saltKey)
         ↓
Append saltIndex
         ↓
Checksum = hash###saltIndex
         ↓
Send to PhonePe with X-VERIFY header
         ↓
PhonePe validates checksum
         ↓
Processes payment
         ↓
PhonePe generates response checksum
         ↓
Backend verifies response checksum
         ↓
Updates database if valid
```

---

## Error Handling Flow

```
User creates order
       ↓
Try to init payment
       ↓
    ┌─────┐
    │ OK? │
    └──┬──┘
       │
  ┌────┴────┐
  │         │
 YES       NO
  │         │
  │         └─→ Return error to user
  │             • Invalid merchant ID
  │             • API connection failed
  │             • Invalid amount
  │
  ↓
Redirect to PhonePe
       ↓
User completes payment
       ↓
    ┌─────┐
    │ OK? │
    └──┬──┘
       │
  ┌────┴────┐
  │         │
SUCCESS   FAILED
  │         │
  │         └─→ Update Payment: "failed"
  │             Update Order: paymentStatus = "failed"
  │             Redirect user with error
  │
  ↓
Update Payment: "success"
Update Order: paymentStatus = "paid"
Redirect user with success
```

---

## Component Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React/Vue)          │
│  • OrderPage.jsx                        │
│  • PaymentCallback.jsx                  │
│  • OrderSuccess.jsx                     │
└──────────────┬──────────────────────────┘
               │ HTTP Requests
               ▼
┌─────────────────────────────────────────┐
│        Backend - Express.js API         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Routes Layer                     │  │
│  │  • orderRoutes.js                 │  │
│  │  • paymentRoutes.js               │  │
│  └────────────┬──────────────────────┘  │
│               │                         │
│  ┌────────────▼──────────────────────┐  │
│  │  Controllers Layer                │  │
│  │  • orderController.js             │  │
│  │  • phonePeController.js           │  │
│  └────────────┬──────────────────────┘  │
│               │                         │
│  ┌────────────▼──────────────────────┐  │
│  │  Config Layer                     │  │
│  │  • phonepe.js (checksum utils)    │  │
│  └────────────┬──────────────────────┘  │
│               │                         │
│  ┌────────────▼──────────────────────┐  │
│  │  Models Layer                     │  │
│  │  • Order.js                       │  │
│  │  • Payment.js                     │  │
│  └────────────┬──────────────────────┘  │
└───────────────┼──────────────────────────┘
                │
                ▼
        ┌──────────────┐
        │   MongoDB    │
        │   Database   │
        └──────────────┘
                │
                │ External API
                ▼
        ┌──────────────┐
        │   PhonePe    │
        │     API      │
        └──────────────┘
```

---

This diagram shows the complete flow from user action to database update! 🎉
