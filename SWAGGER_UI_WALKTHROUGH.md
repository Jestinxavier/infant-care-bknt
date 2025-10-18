# 🎨 Swagger UI Walkthrough

## What You'll See When You Open http://localhost:3000/api-docs

---

## 📱 Main Interface

```
╔════════════════════════════════════════════════════════════╗
║  Online Shopping Backend API                        [🔍]   ║
║  Version 1.0.0                                              ║
║                                                             ║
║  Comprehensive API documentation for Online Shopping        ║
║  Backend with JWT authentication, product management,       ║
║  orders, payments (PhonePe), and more.                     ║
║                                                             ║
║  Servers: [http://localhost:5000 ▼]                       ║
║                                                [Authorize 🔒]║
╠════════════════════════════════════════════════════════════╣
║  Tags:                                                      ║
║                                                             ║
║  ▼ Authentication    [4 endpoints]                         ║
║  ▼ Products         [2 endpoints]                         ║
║  ▼ Variants         [1 endpoint]                          ║
║  ▼ Orders           [1 endpoint]                          ║
║  ▼ Payments         [3 endpoints]                         ║
║  ▼ Addresses        [3 endpoints]                         ║
║  ▼ Reviews          [2 endpoints]                         ║
║                                                             ║
╠════════════════════════════════════════════════════════════╣
║  Schemas ▼                                                  ║
║    - User                                                   ║
║    - Product                                                ║
║    - Variant                                                ║
║    - Order                                                  ║
║    - Payment                                                ║
║    - Address                                                ║
║    - Review                                                 ║
║    - Error                                                  ║
╚════════════════════════════════════════════════════════════╝
```

---

## 🔐 Authentication Section (Expanded)

```
▼ Authentication
  User authentication and authorization endpoints

  POST /api/v1/auth/register
    Register a new user
    [Try it out]

  POST /api/v1/auth/login
    Login user
    [Try it out]

  POST /api/v1/auth/refresh
    Refresh access token
    [Try it out]

  POST /api/v1/auth/logout
    Logout user
    [Try it out]
```

---

## 🧪 Testing an Endpoint

### Step 1: Click "Try it out"

```
POST /api/v1/auth/login
  Login user

  [Try it out]  ← Click here
```

### Step 2: Fill Request Body

```
Request body *
application/json

{
  "email": "john@example.com",      ← Edit this
  "password": "password123"          ← Edit this
}

[Execute]  ← Click to test
```

### Step 3: See Response

```
Responses

Code    Description
200     Login successful
401     Invalid credentials

Server response

Code: 200
Response body:
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Response headers:
content-type: application/json; charset=utf-8
```

---

## 🔒 Authorization Dialog

Click the "Authorize" button at top:

```
╔═══════════════════════════════════════════════╗
║  Available authorizations                     ║
║                                               ║
║  bearerAuth (http, Bearer)                    ║
║  Enter JWT token obtained from login          ║
║                                               ║
║  Value: Bearer eyJhbGciOiJIU...              ║
║         ↑ Paste your token here               ║
║                                               ║
║         [Authorize]  [Close]                  ║
╚═══════════════════════════════════════════════╝
```

---

## 💳 Payment Flow Example

### 1. Create Order

```
POST /api/v1/orders/create
  Create a new order

Request body:
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

Response (201):
{
  "success": true,
  "message": "✅ Order created successfully",
  "order": {
    "_id": "64abc123def456792",
    "totalAmount": 1500,
    ...
  },
  "requiresPayment": true,
  "paymentMethod": "PhonePe"
}
```

### 2. Initialize Payment

```
POST /api/v1/payments/phonepe/init
  Initialize PhonePe payment

Request body:
{
  "orderId": "64abc123def456792",
  "amount": 1500,
  "userId": "64abc123def456789",
  "userPhone": "9876543210"
}

Response (200):
{
  "success": true,
  "data": {
    "paymentUrl": "https://mercury-uat.phonepe.com/...",
    "transactionId": "TXN_64abc123def456792_1234567890"
  }
}
```

### 3. Check Status

```
GET /api/v1/payments/phonepe/status/{transactionId}

Parameters:
  transactionId: TXN_64abc123def456792_1234567890

Response (200):
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

## 📦 Product Creation Example

```
POST /api/v1/product/create
  Create a new product with variants

  🔒 Requires: bearerAuth

Request body (multipart/form-data):

┌─────────────────────────────────────┐
│ name *           Premium T-Shirt    │
│ description *    High quality       │
│ category *       Clothing           │
│ brand *          Nike               │
│ images          [Choose Files]      │
│ variants *      [{"size":"M",...}]  │
└─────────────────────────────────────┘

Response (201):
{
  "success": true,
  "message": "Product created successfully",
  "product": { ... },
  "variants": [ ... ]
}
```

---

## 🎨 Schema Viewer

Click on a schema to expand:

```
▼ Order
  type: object
  
  Properties:
  
  _id
    type: string
  
  userId
    type: string
  
  items
    type: array
    items:
      type: object
      properties:
        productId: string
        variantId: string
        quantity: number
        price: number
  
  totalAmount
    type: number
    example: 1500
  
  paymentStatus
    type: string
    enum: [pending, paid, failed, refunded]
    example: pending
  
  paymentMethod
    type: string
    enum: [COD, Razorpay, Stripe, PhonePe]
    example: PhonePe
```

---

## 🔍 Search Functionality

```
╔═════════════════════════════════════╗
║  🔍  Search                         ║
╚═════════════════════════════════════╝

Type "payment" → Shows:
  - POST /api/v1/payments/phonepe/init
  - POST /api/v1/payments/phonepe/callback
  - GET /api/v1/payments/phonepe/status/{id}

Type "address" → Shows:
  - POST /api/v1/addresses/create
  - GET /api/v1/addresses/{userId}
  - PUT /api/v1/addresses/{addressId}
```

---

## 📋 Copy as cURL

Each endpoint has a "Copy as cURL" option:

```
curl -X 'POST' \
  'http://localhost:5000/api/v1/auth/login' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "email": "john@example.com",
  "password": "password123"
}'
```

---

## 🌈 Visual Features

### Color Coding

- **Green**: POST (Create)
- **Blue**: GET (Read)
- **Orange**: PUT (Update)
- **Red**: DELETE (Delete)

### Icons

- 🔒 Lock icon: Requires authentication
- ⚡ Lightning: Try it out enabled
- ✓ Check: Authorized
- ⚠️ Warning: Error response

### Sections

- **Parameters**: Path/Query params
- **Request Body**: JSON/Form data
- **Responses**: Status codes & examples
- **Schemas**: Data models

---

## 🎯 Interactive Elements

### Clickable Items:

1. **Tag headers** - Expand/collapse sections
2. **Endpoint names** - Open endpoint details
3. **Try it out** - Enable testing
4. **Execute** - Send request
5. **Authorize** - Set authentication
6. **Schemas** - View data models
7. **Examples** - See sample data

### Keyboard Shortcuts:

- `Ctrl+F` - Search endpoints
- `Esc` - Close modals
- `Tab` - Navigate fields

---

## 📱 Mobile View

On smaller screens, Swagger UI adapts:

```
╔════════════════════╗
║  API Docs     [☰] ║
╠════════════════════╣
║  ▼ Authentication  ║
║                    ║
║  POST /register    ║
║  POST /login       ║
║                    ║
║  ▼ Products        ║
║                    ║
║  POST /create      ║
║  PUT /update       ║
╚════════════════════╝
```

---

## 🎊 Best Practices

### Testing Flow:

1. **Start simple** - Test GET endpoints first
2. **Authenticate** - Login to get token
3. **Authorize** - Use token for protected endpoints
4. **Create resources** - Test POST endpoints
5. **Verify** - Check GET endpoints
6. **Update** - Test PUT endpoints

### Documentation Tips:

1. **Read descriptions** carefully
2. **Check required fields** (marked with *)
3. **View examples** for correct format
4. **Note status codes** for error handling
5. **Use schemas** to understand data structure

---

## 🚀 Power User Features

### Advanced Testing:

1. **Server selection** - Switch between dev/prod
2. **Request editing** - Modify examples
3. **Response inspection** - View headers/body
4. **Schema validation** - Ensure correct format
5. **Download spec** - Export OpenAPI JSON

### Developer Tools:

1. **Browser DevTools** - Network tab for debugging
2. **Copy as fetch** - JavaScript code
3. **Copy as cURL** - Command line
4. **Download responses** - Save JSON
5. **Share endpoints** - Direct URL to endpoint

---

## ✨ Summary

When you visit http://localhost:3000/api-docs you get:

- ✅ **Clean interface** with all endpoints
- ✅ **Interactive testing** in browser
- ✅ **Real-time responses** from your server
- ✅ **Authentication support** built-in
- ✅ **Schema viewer** for data models
- ✅ **Code examples** in multiple formats
- ✅ **Mobile-friendly** responsive design
- ✅ **Search functionality** to find endpoints
- ✅ **Professional presentation** for your API

---

**Go ahead and explore!** 🎉

Visit: http://localhost:3000/api-docs
