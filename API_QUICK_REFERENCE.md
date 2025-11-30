# 🚀 API Quick Reference Card

## 📍 Access Points

| Resource | URL |
|----------|-----|
| API Documentation | http://localhost:3000/api-docs |
| OpenAPI Spec (JSON) | http://localhost:3000/api-docs.json |
| Base API URL | http://localhost:3000/api/v1 |

---

## 🔑 Authentication Flow

```
1. Register → POST /api/v1/auth/register
2. Login    → POST /api/v1/auth/login (get accessToken)
3. Use Token → Add header: Authorization: Bearer <token>
4. Refresh   → POST /api/v1/auth/refresh (when expired)
5. Logout    → POST /api/v1/auth/logout
```

---

## 📦 Complete Order Flow

```
1. Create Product → POST /api/v1/product/create (with variants)
2. Create Address → POST /api/v1/addresses/create
3. Create Order   → POST /api/v1/orders/create (paymentMethod: PhonePe)
4. Init Payment   → POST /api/v1/payments/phonepe/init
5. User pays      → (PhonePe payment page)
6. Callback       → POST /api/v1/payments/phonepe/callback (auto)
7. Check Status   → GET /api/v1/payments/phonepe/status/:txnId
8. Add Review     → POST /api/v1/review/add
```

---

## 🎯 Common Requests

### Register User
```bash
POST /api/v1/auth/register
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123"
}
```

### Login
```bash
POST /api/v1/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}
# Returns: { accessToken, refreshToken }
```

### Create Product (Requires Auth)
```bash
POST /api/v1/product/create
Headers: Authorization: Bearer <token>
Content-Type: multipart/form-data

Fields:
- name: "Premium T-Shirt"
- description: "High quality"
- category: "Clothing"
- brand: "Nike"
- images: [files]
- variants: '[{"size":"M","color":"Red","price":999,"stock":50}]'
```

### Create Order
```bash
POST /api/v1/orders/create
{
  "userId": "64abc123...",
  "items": [
    { "variantId": "64abc456...", "quantity": 2 }
  ],
  "addressId": "64abc789...",
  "paymentMethod": "PhonePe"
}
# Returns: { order, payment, requiresPayment: true }
```

### Initialize PhonePe Payment
```bash
POST /api/v1/payments/phonepe/init
{
  "orderId": "64abc123...",
  "amount": 1500,
  "userId": "64abc456...",
  "userPhone": "9876543210"
}
# Returns: { paymentUrl, transactionId }
```

### Check Payment Status
```bash
GET /api/v1/payments/phonepe/status/TXN_123456
# Returns: { state: "COMPLETED", responseCode: "SUCCESS" }
```

### Create Address
```bash
POST /api/v1/addresses/create
{
  "userId": "64abc123...",
  "fullName": "John Doe",
  "phone": "9876543210",
  "addressLine1": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "country": "India"
}
```

### Get User Addresses
```bash
POST /api/v1/addresses
{
  "userId": "64abc123..."
}
# Returns: { success: true, addresses: [...], message: "✅ Addresses fetched successfully" }
```

### Add Review
```bash
POST /api/v1/review/add
{
  "userId": "64abc123...",
  "variantId": "64abc456...",
  "rating": 5,
  "comment": "Excellent product!"
}
```

---

## 🔐 Protected Endpoints

Require `Authorization: Bearer <token>` header:

- ✅ POST `/api/v1/product/create`
- ✅ PUT `/api/v1/product/update`
- ✅ PUT `/api/v1/variants/update`

---

## 📊 HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 404 | Not Found |
| 500 | Server Error |

---

## 🎨 Payment Methods

| Method | Value | Status |
|--------|-------|--------|
| Cash on Delivery | `COD` | ✅ |
| PhonePe | `PhonePe` | ✅ |
| Razorpay | `Razorpay` | 🔜 |
| Stripe | `Stripe` | 🔜 |

---

## 📝 Request Content Types

| Endpoint | Content-Type |
|----------|--------------|
| Auth | `application/json` |
| Orders | `application/json` |
| Payments | `application/json` |
| Addresses | `application/json` |
| Reviews | `application/json` |
| Products | `multipart/form-data` |
| Variants | `multipart/form-data` |

---

## 🌟 Testing Tips

1. **Start server:** `npm run dev`
2. **Open Swagger:** http://localhost:3000/api-docs
3. **Use "Try it out"** for instant testing
4. **Authorize once** for all protected endpoints
5. **Copy curl** for command line testing

---

## 📱 Frontend Integration Example

```javascript
const API_BASE = 'http://localhost:3000/api/v1';

// Login
const login = async (email, password) => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const { accessToken } = await res.json();
  localStorage.setItem('token', accessToken);
};

// Create order
const createOrder = async (orderData) => {
  const res = await fetch(`${API_BASE}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  return res.json();
};

// Init PhonePe payment
const initPayment = async (paymentData) => {
  const res = await fetch(`${API_BASE}/payments/phonepe/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData)
  });
  const { data } = await res.json();
  window.location.href = data.paymentUrl; // Redirect to PhonePe
};
```

---

## 🆘 Troubleshooting

### "Unauthorized" Error
- Check if token is included in header
- Token format: `Bearer <token>`
- Token might be expired (use refresh endpoint)

### "Validation Error"
- Check required fields in Swagger docs
- Verify data types match schema
- Ensure email format is valid

### "Not Found" Error
- Verify endpoint URL is correct
- Check if resource ID exists
- Ensure server is running

### Payment Issues
- Verify PhonePe credentials in .env
- Check callback URL is accessible
- Use ngrok for local testing

---

## 🔗 Useful Commands

```bash
# Start server
npm run dev

# Check if server is running
curl http://localhost:3000/

# Test login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# View API docs (in browser)
open http://localhost:3000/api-docs
```

---

## 📚 More Resources

- **Full Documentation:** `API_DOCUMENTATION_GUIDE.md`
- **PhonePe Guide:** `PHONEPE_INTEGRATION.md`
- **Testing Guide:** `PHONEPE_TESTING_GUIDE.md`
- **Postman Collection:** `PhonePe_API_Collection.postman.json`

---

**Happy Coding! 🚀**

Keep this handy for quick reference!
