# 📚 API Documentation Guide

## 🎉 Swagger/OpenAPI Documentation Available!

Your API now has **interactive, comprehensive documentation** powered by Swagger UI.

---

## 🚀 Accessing the Documentation

### Local Development
Once your server is running, access the documentation at:

```
http://localhost:5000/api-docs
```

### Production
```
https://your-domain.com/api-docs
```

---

## 📖 What's Included?

### ✅ Complete API Reference
- **All endpoints documented** with detailed descriptions
- **Request/Response schemas** with examples
- **Authentication requirements** clearly marked
- **Error responses** documented
- **Interactive testing** - Try endpoints directly from the browser!

### 📋 API Categories

1. **Authentication** (`/api/v1/auth`)
   - Register
   - Login
   - Refresh Token
   - Logout

2. **Products** (`/api/v1/product`)
   - Create Product (with variants & images)
   - Update Product

3. **Variants** (`/api/v1/variants`)
   - Update Variant

4. **Orders** (`/api/v1/orders`)
   - Create Order (COD/PhonePe/Razorpay/Stripe)

5. **Payments** (`/api/v1/payments`)
   - Initialize PhonePe Payment
   - PhonePe Callback (Webhook)
   - Check Payment Status

6. **Addresses** (`/api/v1/addresses`)
   - Create Address
   - Get User Addresses
   - Update Address

7. **Reviews** (`/api/v1/review`)
   - Add Review
   - Get Variant Reviews

---

## 🔐 Testing with Authentication

### Using Bearer Token

1. **Login** via `/api/v1/auth/login` endpoint
2. Copy the `accessToken` from response
3. Click **"Authorize"** button at top of Swagger UI
4. Enter: `Bearer <your-token-here>`
5. Click **Authorize**
6. Now you can test protected endpoints!

### Example
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NGFi...
```

---

## 🧪 Interactive Testing

### How to Test Endpoints:

1. **Navigate to any endpoint** in the documentation
2. **Click "Try it out"** button
3. **Fill in parameters** (path, query, body)
4. **Click "Execute"**
5. **View response** immediately below

### Example: Create Order

1. Go to `/api/v1/orders/create`
2. Click "Try it out"
3. Edit the request body:
```json
{
  "userId": "your_user_id",
  "items": [
    {
      "variantId": "your_variant_id",
      "quantity": 2
    }
  ],
  "addressId": "your_address_id",
  "paymentMethod": "PhonePe"
}
```
4. Click "Execute"
5. See the response!

---

## 📱 Using with Frontend

### Get API Schema

Download the OpenAPI schema:
```
http://localhost:5000/api-docs.json
```

Use this with:
- **Frontend generators** (like openapi-typescript)
- **API client libraries**
- **Postman** (import OpenAPI spec)
- **Insomnia** (import OpenAPI spec)

---

## 🎨 Customization

### Swagger UI Features:

- **Dark/Light theme** toggle
- **Search** functionality
- **Collapsible sections**
- **Code examples** in multiple languages
- **Schema viewer**
- **Model definitions**

---

## 📊 All Endpoints Summary

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/register` | Register new user | ❌ |
| POST | `/api/v1/auth/login` | Login user | ❌ |
| POST | `/api/v1/auth/refresh` | Refresh access token | ❌ |
| POST | `/api/v1/auth/logout` | Logout user | ❌ |

### Product Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/product/create` | Create product with variants | ✅ |
| PUT | `/api/v1/product/update` | Update product | ✅ |

### Variant Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| PUT | `/api/v1/variants/update` | Update variant | ✅ |

### Order Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/orders/create` | Create new order | ❌ |

### Payment Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/payments/phonepe/init` | Initialize PhonePe payment | ❌ |
| POST | `/api/v1/payments/phonepe/callback` | PhonePe webhook (auto) | ❌ |
| GET | `/api/v1/payments/phonepe/status/:txnId` | Check payment status | ❌ |

### Address Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/addresses/create` | Create address | ❌ |
| POST | `/api/v1/addresses` | Get user addresses (requires userId in body) | ❌ |
| PUT | `/api/v1/addresses/:addressId` | Update address | ❌ |

### Review Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/review/add` | Add product review | ❌ |
| GET | `/api/v1/review/:variantId` | Get variant reviews | ❌ |

---

## 🔍 Schema Definitions

All schemas are documented in Swagger UI:

- **User** - User account information
- **Product** - Product details
- **Variant** - Product variant (age, color, price, stock)
- **Order** - Order with items and payment info
- **Payment** - Payment transaction details
- **Address** - Delivery address
- **Review** - Product review with rating
- **Error** - Standard error response

---

## 💡 Tips

### For Developers:

1. **Explore schemas** in the "Schemas" section at bottom
2. **Use "Try it out"** to test without Postman
3. **Copy curl commands** from the documentation
4. **Download OpenAPI spec** for code generation

### For Frontend Developers:

1. **Reference exact request/response formats**
2. **See all available fields** for each model
3. **Understand error responses**
4. **Know which fields are required**

### For API Consumers:

1. **No need for separate documentation**
2. **Always up-to-date** with code
3. **Interactive testing**
4. **Clear examples**

---

## 🛠️ Updating Documentation

### When adding new endpoints:

Add Swagger JSDoc comments above your route:

```javascript
/**
 * @swagger
 * /api/v1/your-endpoint:
 *   post:
 *     summary: Your endpoint description
 *     tags: [YourTag]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/your-endpoint', yourHandler);
```

Documentation updates automatically!

---

## 📥 Export Options

### Export as:

1. **JSON** - Download OpenAPI spec
2. **Postman Collection** - Import to Postman
3. **curl Commands** - Copy from any endpoint
4. **Code Snippets** - Various languages available

---

## 🌐 Share with Team

Share the documentation URL with:
- Frontend developers
- QA testers
- Mobile app developers
- Third-party integrators

Everyone can see the exact API contract!

---

## 🎯 Quick Start

1. **Start your server:**
   ```bash
   npm run dev
   ```

2. **Open browser:**
   ```
   http://localhost:5000/api-docs
   ```

3. **Start exploring!** 🚀

---

## 📞 Support

- **Swagger UI Docs:** https://swagger.io/docs/
- **OpenAPI Spec:** https://swagger.io/specification/

---

**Enjoy your beautiful API documentation! 📚✨**
