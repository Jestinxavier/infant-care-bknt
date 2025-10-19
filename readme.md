# 🛒 Online Shopping Backend API

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.1.0-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v8.18+-green.svg)](https://www.mongodb.com/)
[![Swagger](https://img.shields.io/badge/API%20Docs-Swagger-brightgreen.svg)](http://localhost:3000/api-docs)

## 📖 Interactive API Documentation

### 🚀 **[View Live API Documentation](http://localhost:3000/api-docs)** (Swagger UI)

Our complete API is documented with **Swagger/OpenAPI 3.0** - an interactive interface where you can:

- ✅ Test all endpoints directly in your browser
- ✅ See request/response examples
- ✅ Authenticate and test protected routes
- ✅ View all data schemas
- ✅ Export to Postman

> **Quick Start:** Run `npm run dev` and open [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

### 📚 Additional Documentation

| Document                                                        | Description                                   |
| --------------------------------------------------------------- | --------------------------------------------- |
| **[API Documentation Guide](./API_DOCUMENTATION_GUIDE.md)**     | Complete guide to using the API documentation |
| **[API Quick Reference](./API_QUICK_REFERENCE.md)**             | Quick reference card for developers           |
| **[Swagger UI Walkthrough](./SWAGGER_UI_WALKTHROUGH.md)**       | Visual guide to using Swagger UI              |
| **[PhonePe Integration Guide](./PHONEPE_INTEGRATION.md)**       | Complete PhonePe payment integration          |
| **[PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)**         | Step-by-step testing instructions             |
| **[Postman Collection](./PhonePe_API_Collection.postman.json)** | Import into Postman for testing               |

---

## Backend Introduction — E-Commerce Platform

The backend of the E-Commerce Platform is designed to provide a **secure, scalable, and high-performance foundation** for the platform's customer-facing and management functionalities. Built with **Node.js** and **Express**, the backend handles all critical operations including user authentication, product and inventory management, order processing, and integration with secure payment gateways.

### 🌟 Key Features

- 🔐 **JWT Authentication** - Secure access & refresh token system
- 📦 **Product Management** - Products with variants, images via Cloudinary
- 🛒 **Order Processing** - Complete order flow with multiple payment methods
- 💳 **PhonePe Integration** - Online payment gateway with callback handling
- 📍 **Address Management** - User shipping addresses
- ⭐ **Reviews & Ratings** - Product reviews by verified buyers
- 📚 **Swagger Documentation** - Interactive API testing interface
- 🛡️ **Input Validation** - Express-validator for data integrity
- ☁️ **Cloud Storage** - Cloudinary for image uploads

---

## 🛠️ Tech Stack

- **Runtime:** Node.js v18+
- **Framework:** Express.js v5.1.0
- **Database:** MongoDB v8.18+ (Mongoose ODM)
- **Authentication:** JWT (jsonwebtoken)
- **File Upload:** Multer + Cloudinary
- **Validation:** express-validator
- **Documentation:** Swagger UI + OpenAPI 3.0
- **Payment:** PhonePe Payment Gateway

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18 or higher
- MongoDB instance (local or Atlas)
- Cloudinary account
- PhonePe merchant credentials (for payments)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd online-shopping-backend

# Install dependencies
npm install

# Create .env file (see .env.example)
cp .env.example .env

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file with:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/onlineshopping

# JWT Secrets
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# PhonePe
PHONEPE_MERCHANT_ID=your-merchant-id
PHONEPE_SALT_KEY=your-salt-key
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=development
PHONEPE_REDIRECT_URL=http://localhost:3000/payment/callback
PHONEPE_CALLBACK_URL=http://localhost:3000/api/v1/payments/phonepe/callback
```

### Access Points

| Service          | URL                            |
| ---------------- | ------------------------------ |
| **API Base**     | http://localhost:3000/api/v1   |
| **Swagger Docs** | http://localhost:3000/api-docs |
| **Health Check** | http://localhost:3000          |

---

## 📚 API Overview

### 🔑 Authentication Endpoints

| Method | Endpoint                | Description          | Auth Required |
| ------ | ----------------------- | -------------------- | ------------- |
| POST   | `/api/v1/auth/register` | Register new user    | ❌            |
| POST   | `/api/v1/auth/login`    | Login user           | ❌            |
| POST   | `/api/v1/auth/refresh`  | Refresh access token | ❌            |
| POST   | `/api/v1/auth/logout`   | Logout user          | ❌            |

### 📦 Product Endpoints

| Method | Endpoint                 | Description                  | Auth Required |
| ------ | ------------------------ | ---------------------------- | ------------- |
| POST   | `/api/v1/product/create` | Create product with variants | ✅            |
| PUT    | `/api/v1/product/update` | Update product               | ✅            |

### 🎨 Variant Endpoints

| Method | Endpoint                  | Description    | Auth Required |
| ------ | ------------------------- | -------------- | ------------- |
| PUT    | `/api/v1/variants/update` | Update variant | ✅            |

### 🛒 Order Endpoints

| Method | Endpoint                | Description  | Auth Required |
| ------ | ----------------------- | ------------ | ------------- |
| POST   | `/api/v1/orders/create` | Create order | ❌            |

### 💳 Payment Endpoints (PhonePe & Razorpay)

| Method | Endpoint                                 | Description                  | Auth Required |
| ------ | ---------------------------------------- | ---------------------------- | ------------- |
| POST   | `/api/v1/payments/phonepe/init`          | Initialize PhonePe payment   | ❌            |
| POST   | `/api/v1/payments/phonepe/callback`      | PhonePe webhook              | ❌            |
| GET    | `/api/v1/payments/phonepe/status/:txnId` | Check PhonePe status         | ❌            |
| POST   | `/api/v1/payments/razorpay/create-order` | Create Razorpay order        | ❌            |
| POST   | `/api/v1/payments/razorpay/verify`       | Verify Razorpay payment      | ❌            |
| POST   | `/api/v1/payments/razorpay/webhook`      | Razorpay webhook             | ❌            |
| GET    | `/api/v1/payments/razorpay/payment/:id`  | Get Razorpay payment details | ❌            |

### 📍 Address Endpoints

| Method | Endpoint                       | Description        | Auth Required |
| ------ | ------------------------------ | ------------------ | ------------- |
| POST   | `/api/v1/addresses/create`     | Create address     | ❌            |
| GET    | `/api/v1/addresses/:userId`    | Get user addresses | ❌            |
| PUT    | `/api/v1/addresses/:addressId` | Update address     | ❌            |

### ⭐ Review Endpoints

| Method | Endpoint                    | Description         | Auth Required |
| ------ | --------------------------- | ------------------- | ------------- |
| POST   | `/api/v1/review/add`        | Add review          | ❌            |
| GET    | `/api/v1/review/:variantId` | Get variant reviews | ❌            |

> **📝 Note:** For detailed request/response examples, visit the [Swagger Documentation](http://localhost:3000/api-docs)

---

## 💳 Payment Integration

### Multiple Payment Gateways Supported

You can use **both PhonePe and Razorpay** - users choose their preferred method!

#### PhonePe Payment Flow

1. **Create Order** with `paymentMethod: "PhonePe"`
2. **Initialize Payment** - Get payment URL
3. **User Pays** on PhonePe page
4. **Callback** - PhonePe notifies backend (automatic)
5. **Verify Status** - Check payment status

#### Razorpay Payment Flow

1. **Create Order** with `paymentMethod: "Razorpay"`
2. **Create Razorpay Order** - Get order ID
3. **Open Razorpay Checkout** - Modal payment
4. **Payment Success** - Get signature
5. **Verify Payment** - Backend validates signature

For complete integration guides:

- [PhonePe Integration Guide](./PHONEPE_INTEGRATION.md)
- [PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)
- [Razorpay Integration Guide](./RAZORPAY_INTEGRATION.md)

---

## Base URL

```
http://localhost:3000/api/auth
```

> Make sure your server is running and CORS is configured if calling from a frontend.

---

## Routes & Usage

### 1. **Register User**

**Endpoint:** `/register`
**Method:** `POST`
**Description:** Creates a new user with username, email, password, and role. Password is hashed before saving.

**Request Body (JSON):**

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "role": "user" // optional, default is "user"
}
```

**Response (Success 201):**

```json
{
  "id": "64d123abc1234567abcdef01",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "user"
}
```

**Errors:**

- `400` if username or email already exists
- `400` if validation fails

---

### 2. **Login User**

**Endpoint:** `/login`
**Method:** `POST`
**Description:** Authenticates a user using email and password. Returns **access token** and sets **refresh token** in an HttpOnly cookie.

**Request Body (JSON):**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (Success 200):**

```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Notes:**

- Refresh token is stored in HttpOnly cookie for security
- Use access token in `Authorization: Bearer <token>` header for protected routes

---

### 3. **Refresh Access Token**

**Endpoint:** `/refresh`
**Method:** `POST`
**Description:** Generates a new access token using the refresh token stored in HttpOnly cookie.

**Request:**

- No body required
- Must send **cookie** with request (`credentials: 'include'` in fetch/axios)

**Response (Success 200):**

```json
{
  "accessToken": "new-access-token"
}
```

**Errors:**

- `401` if no refresh token cookie present
- `403` if refresh token is invalid or expired

---

### 4. **Logout User**

**Endpoint:** `/logout`
**Method:** `POST`
**Description:** Deletes the refresh token from the database and clears the cookie, effectively logging the user out.

**Request:**

- Must send **cookie** with refresh token

**Response (Success 200):**

```json
{
  "message": "Logout successful"
}
```

---

## Security Notes

- **Passwords** are hashed with `bcryptjs`
- **Access tokens** are short-lived JWTs, stored in **memory** in the frontend
- **Refresh tokens** are long-lived JWTs stored in **HttpOnly cookies**
- All routes support **JWT-based authentication** for secure access to protected resources

---

## Example Usage in React (Frontend)

```js
const res = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
  credentials: "include", // important to send HttpOnly cookie
});

const data = await res.json();
const accessToken = data.accessToken; // store in memory
```

---

## Dependencies

- express
- bcryptjs
- jsonwebtoken
- mongoose
- cookie-parser

Frontend (React)
|
| POST /login (email & password)
v
Backend (Node.js)
|
| Validate user
| Generate accessToken & refreshToken
| Send accessToken in JSON
| Set refreshToken in HttpOnly cookie
v
Frontend (React)
|
| Store accessToken in memory
| HttpOnly cookie automatically stored by browser
v
User requests protected data
|
| GET /protected
| Authorization: Bearer <accessToken>
v
Backend (Node.js)
|
| authenticateToken middleware
| Verify accessToken
| Return protected resource
v
Frontend receives protected data

---

## Backend Form Validation

This API uses **`express-validator`** to validate user input on the backend for security and data integrity.

---

### 1️ **Register Validation**

- **Fields validated:**

  - `username` → required, min 3 characters
  - `email` → required, valid email format
  - `password` → required, min 6 characters

**Example Request:**

```json
POST /api/auth/register
{
  "username": "jo",
  "email": "invalid-email",
  "password": "123"
}
```

**Example Error Response (400):**

```json
{
  "errors": [
    {
      "message": "Username must be at least 3 characters",
      "param": "username"
    },
    { "message": "Invalid email format", "param": "email" },
    { "message": "Password must be at least 6 characters", "param": "password" }
  ]
}
```

---

### 2️ **Login Validation**

- **Fields validated:**

  - `email` → required, valid email
  - `password` → required

**Example Request:**

```json
POST /api/auth/login
{
  "email": "",
  "password": ""
}
```

**Example Error Response (400):**

```json
{
  "errors": [
    { "message": "Email is required", "param": "email" },
    { "message": "Password is required", "param": "password" }
  ]
}
```

---

### 3️ **Usage in Routes**

```js
const {
  registerValidation,
  loginValidation,
  validate,
} = require("../middleware/validators");

router.post("/register", registerValidation, validate, register);
router.post("/login", loginValidation, validate, login);
```

> All invalid input is rejected **before reaching the controller**, ensuring only clean data enters the database.

---

---

## Product & Variant Example (Scalable Model)

In this scalable model, each product has a **single Product document**, and its **variants are stored in a separate collection**. This allows for multiple variants per product, multiple images per variant, and flexible stock/price management.

### **1️Product Creation**

```javascript
const product = await Product.create({
  name: "Floral Summer Dress",
  description: "A beautiful floral dress perfect for summer outings",
  category: "Dresses",
  tags: ["summer", "floral", "casual"],
  basePrice: 500,
});
```

**Example Product Document (MongoDB)**

```json
{
  "_id": "64d8f9e7c1234a0b1c234567",
  "name": "Floral Summer Dress",
  "description": "A beautiful floral dress perfect for summer outings",
  "category": "Dresses",
  "tags": ["summer", "floral", "casual"],
  "basePrice": 500,
  "createdAt": "2025-10-02T07:45:00.000Z",
  "updatedAt": "2025-10-02T07:45:00.000Z"
}
```

---

### **2️ Variant Creation**

```javascript
await Variant.create([
  {
    productId: product._id,
    color: "Red",
    size: "S",
    price: 500,
    stock: 10,
    sku: "FLD-RED-S",
    images: [
      "https://example.com/images/floral-red-front.jpg",
      "https://example.com/images/floral-red-back.jpg",
    ],
  },
  {
    productId: product._id,
    color: "Red",
    size: "M",
    price: 500,
    stock: 5,
    sku: "FLD-RED-M",
    images: [
      "https://example.com/images/floral-red-front.jpg",
      "https://example.com/images/floral-red-back.jpg",
    ],
  },
  {
    productId: product._id,
    color: "Blue",
    size: "S",
    price: 550,
    stock: 8,
    sku: "FLD-BLU-S",
    images: [
      "https://example.com/images/floral-blue-front.jpg",
      "https://example.com/images/floral-blue-back.jpg",
    ],
  },
]);
```

**Example Variant Documents (MongoDB)**

```json
[
  {
    "_id": "64d90123456789abcdef1234",
    "productId": "64d8f9e7c1234a0b1c234567",
    "color": "Red",
    "size": "S",
    "price": 500,
    "stock": 10,
    "sku": "FLD-RED-S",
    "images": [
      "https://example.com/images/floral-red-front.jpg",
      "https://example.com/images/floral-red-back.jpg"
    ]
  },
  {
    "_id": "64d90123456789abcdef1235",
    "productId": "64d8f9e7c1234a0b1c234567",
    "color": "Red",
    "size": "M",
    "price": 500,
    "stock": 5,
    "sku": "FLD-RED-M",
    "images": [
      "https://example.com/images/floral-red-front.jpg",
      "https://example.com/images/floral-red-back.jpg"
    ]
  },
  {
    "_id": "64d90123456789abcdef1236",
    "productId": "64d8f9e7c1234a0b1c234567",
    "color": "Blue",
    "size": "S",
    "price": 550,
    "stock": 8,
    "sku": "FLD-BLU-S",
    "images": [
      "https://example.com/images/floral-blue-front.jpg",
      "https://example.com/images/floral-blue-back.jpg"
    ]
  }
]
```

---

### **3️ How It Works**

- **Product** document stores general info about the item (name, category, description).
- **Variant** documents store **specific combinations** (size, color), their price, stock, SKU, and images.
- **Frontend usage:** Fetch product + variants using `productId` to display all options on a single product page.

**Benefits of this approach:**

- Supports **multiple variants per product**
- Multiple images per variant
- Flexible **stock and pricing** per variant
- Scalable for large catalogs

---

---

## 🧩 Product Creation API (with Variants & Cloudinary Image Upload)

### **Endpoint**

```
POST /api/products/create
```

### **Description**

Creates a new product with one or more variants (each variant can have its own set of images uploaded to Cloudinary).
Each variant’s images must use the field name format:

```
images-<SKU>
```

> Example: `images-FLD-RED-S`, `images-FLD-RED-M`

---

### **Headers**

```
Content-Type: multipart/form-data
Authorization: Bearer <your-access-token>
```

---

### **Form-Data Example (for Hoppscotch/Postman)**

| Key                  | Type | Example                                            |
| -------------------- | ---- | -------------------------------------------------- |
| **name**             | Text | Floral Dress                                       |
| **description**      | Text | Beautiful summer floral dress for women            |
| **category**         | Text | Dresses                                            |
| **variants**         | Text | (see JSON below)                                   |
| **images-FLD-RED-S** | File | upload multiple images for variant SKU `FLD-RED-S` |
| **images-FLD-RED-M** | File | upload multiple images for variant SKU `FLD-RED-M` |

---

### **Variants JSON (for the `variants` field)**

Paste this JSON as a **text string** in your form-data:

```json
[
  {
    "sku": "FLD-RED-S",
    "color": "Red",
    "size": "S",
    "price": 500,
    "stock": 10
  },
  {
    "sku": "FLD-RED-M",
    "color": "Red",
    "size": "M",
    "price": 500,
    "stock": 5
  }
]
```

---

### **Example cURL Request**

```bash
curl -X POST http://localhost:3000/api/products/create \
  -H "Authorization: Bearer <token>" \
  -F "name=Floral Dress" \
  -F "description=Beautiful summer floral dress" \
  -F "category=Dresses" \
  -F 'variants=[{"sku":"FLD-RED-S","color":"Red","size":"S","price":500,"stock":10},{"sku":"FLD-RED-M","color":"Red","size":"M","price":500,"stock":5}]' \
  -F "images-FLD-RED-S=@/path/to/small1.jpg" \
  -F "images-FLD-RED-S=@/path/to/small2.jpg" \
  -F "images-FLD-RED-M=@/path/to/medium1.jpg"
```

---

### **Response**

```json
{
  "message": "Product and variants created successfully"
}
```

---

### **Notes**

- Field names must exactly match your variant’s `sku` value (e.g., `images-<SKU>`).
- Each variant’s images are uploaded to Cloudinary inside the `products/` folder.
- The backend automatically maps each uploaded file to its matching variant.

---

---

## 1️ Address API

**Endpoint:**  
`POST /api/v1/address/create`

**Purpose:**  
Create and store a new shipping address for a user.

**Request Payload:**

```json
{
  "userId": "68dd872174cd6f2b7656d4c9",
  "street": "123 MG Road",
  "city": "Kochi",
  "state": "Kerala",
  "pincode": "682001",
  "country": "India",
  "landmark": "Near Metro Station",
  "phoneNumber": "9876543210"
}
```

**Success Response:**

```json
{
  "success": true,
  "message": " Address created successfully",
  "address": {
    "_id": "68eac84fcee8cde769566b33",
    "userId": "68dd872174cd6f2b7656d4c9",
    "street": "123 MG Road",
    "city": "Kochi",
    "state": "Kerala",
    "pincode": "682001",
    "country": "India",
    "landmark": "Near Metro Station",
    "phoneNumber": "9876543210",
    "createdAt": "2025-10-10T15:45:22.110Z",
    "updatedAt": "2025-10-10T15:45:22.110Z"
  }
}
```

---

## 2️ Order API

**Endpoint:**
`POST /api/v1/orders/create`

**Purpose:**
Create a new order with product variants, address reference, and payment details.
Supports `COD` or online payment (e.g., Razorpay / PhonePe).

**Request Payload:**

```json
{
  "userId": "68dd872174cd6f2b7656d4c9",
  "items": [
    {
      "variantId": "68e4143ac9336634139e8b09",
      "quantity": 2
    }
  ],
  "addressId": "68eac84fcee8cde769566b33",
  "paymentMethod": "COD"
}
```

**Success Response:**

```json
{
  "success": true,
  "message": " Order created successfully",
  "order": {
    "_id": "68eaf31d4c7bb44f36e44e90",
    "userId": "68dd872174cd6f2b7656d4c9",
    "items": [
      {
        "productId": "68e4143ac9336634139e8b07",
        "variantId": "68e4143ac9336634139e8b09",
        "quantity": 2,
        "price": 500
      }
    ],
    "totalAmount": 1000,
    "addressId": "68eac84fcee8cde769566b33",
    "paymentMethod": "COD",
    "createdAt": "2025-10-10T16:22:10.221Z",
    "updatedAt": "2025-10-10T16:22:10.221Z"
  },
  "payment": {
    "_id": "68eaf31d4c7bb44f36e44e91",
    "orderId": "68eaf31d4c7bb44f36e44e90",
    "userId": "68dd872174cd6f2b7656d4c9",
    "amount": 1000,
    "method": "COD",
    "status": "pending",
    "createdAt": "2025-10-10T16:22:10.222Z"
  }
}
```

---

### Notes:

- `items` must include `variantId` and `quantity`. The backend fills in `price` and `productId` automatically from the `Variant` model.
- `addressId` can be an existing address or a newly created address ID.
- `paymentMethod` can be `COD`, `Razorpay`, `PhonePe`, etc., depending on the integration.

---

## 3️ Review & Rating API

This API allows users to post **reviews and ratings (1–5 stars)** for product variants they have purchased. Only users who ordered the variant can add a review.

---

### **1️ Add Review**

**Endpoint:**
`POST /api/v1/reviews/add`

**Purpose:**
Add a rating and review for a variant after purchase.

**Request Payload:**

```json
{
  "userId": "68dd872174cd6f2b7656d4c9",
  "variantId": "68e4143ac9336634139e8b09",
  "orderId": "68eaf31d4c7bb44f36e44e90",
  "rating": 5,
  "review": "Really liked the color and quality!"
}
```

**Success Response:**

```json
{
  "success": true,
  "message": " Review added successfully",
  "review": {
    "_id": "68eb12cd4c7bb44f36e44f01",
    "userId": "68dd872174cd6f2b7656d4c9",
    "variantId": "68e4143ac9336634139e8b09",
    "orderId": "68eaf31d4c7bb44f36e44e90",
    "rating": 5,
    "review": "Really liked the color and quality!",
    "createdAt": "2025-10-12T18:40:00.123Z",
    "updatedAt": "2025-10-12T18:40:00.123Z"
  }
}
```

**Notes:**

- `rating` must be **1 to 5**.
- `userId` must match the order’s user.
- `variantId` must exist in the order.
- Users can only review **once per variant per order**.

---

### **2️ Get Reviews for a Variant**

**Endpoint:**
`GET /api/v1/reviews/:variantId`

**Purpose:**
Fetch all reviews for a specific variant.

**Success Response:**

```json
{
  "success": true,
  "reviews": [
    {
      "_id": "68eb12cd4c7bb44f36e44f01",
      "userId": {
        "_id": "68dd872174cd6f2b7656d4c9",
        "username": "jestin"
      },
      "variantId": "68e4143ac9336634139e8b09",
      "orderId": "68eaf31d4c7bb44f36e44e90",
      "rating": 5,
      "review": "Really liked the color and quality!",
      "createdAt": "2025-10-12T18:40:00.123Z"
    }
  ]
}
```

---

---

This README explains all the endpoints and how to use them.

---

## 📚 Complete Documentation Index

### API Documentation

- **[🚀 Swagger UI - Interactive API Docs](http://localhost:3000/api-docs)** - Test all endpoints in browser
- **[API Documentation Guide](./API_DOCUMENTATION_GUIDE.md)** - Complete guide with usage examples
- **[API Quick Reference](./API_QUICK_REFERENCE.md)** - Quick reference card for developers
- **[Swagger UI Walkthrough](./SWAGGER_UI_WALKTHROUGH.md)** - Visual guide to using the documentation
- **[API Summary](./README_API_DOCS.md)** - Overview of all documented endpoints

### Payment Integration

- **[PhonePe Integration Guide](./PHONEPE_INTEGRATION.md)** - Complete integration guide
- **[PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)** - Step-by-step testing instructions
- **[PhonePe Flow Diagram](./PHONEPE_FLOW_DIAGRAM.md)** - Visual payment flow diagrams
- **[PhonePe Credentials Guide](./PHONEPE_CREDENTIALS_GUIDE.md)** - How to get credentials
- **[Razorpay Integration Guide](./RAZORPAY_INTEGRATION.md)** - Razorpay integration
- **[Integration Summary](./INTEGRATION_SUMMARY.md)** - Summary of all changes

### Testing & Development

- **[Postman Collection](./PhonePe_API_Collection.postman.json)** - Import for Postman testing
- **[Environment Variables Example](./.env.phonepe.example)** - PhonePe configuration template

---

## 🛡️ Security Features

- ✅ **Password Hashing** - bcryptjs with salt rounds
- ✅ **JWT Tokens** - Access & refresh token system
- ✅ **HttpOnly Cookies** - Secure refresh token storage
- ✅ **Input Validation** - Express-validator on all inputs
- ✅ **CORS Protection** - Configured for frontend origins
- ✅ **Checksum Verification** - PhonePe payment validation

---

## 📊 Database Models

### Collections

- **User** - User accounts with authentication
- **Product** - Product catalog information
- **Variant** - Product variants (size, color, price, stock)
- **Order** - Customer orders with items
- **Payment** - Payment transactions (COD, PhonePe, etc.)
- **Address** - User shipping addresses
- **Review** - Product reviews and ratings
- **Token** - Refresh tokens for authentication

---

## 🧑‍💻 Development

### Project Structure

```
src/
├── config/           # Configuration files
│   ├── cloudinary.js   # Cloudinary setup
│   ├── phonepe.js      # PhonePe configuration
│   └── swagger.js      # Swagger/OpenAPI config
├── controllers/      # Route controllers
│   ├── auth/          # Authentication logic
│   ├── product/       # Product management
│   ├── payment/       # Payment processing
│   ├── Order/         # Order handling
│   ├── address/       # Address management
│   ├── Variant/       # Variant management
│   └── review/        # Review system
├── models/           # Mongoose schemas
├── routes/           # API routes
├── middlewares/      # Auth & validation
├── utils/            # Helper functions
├── app.js            # Express app setup
└── server.js         # Server entry point
```

### NPM Scripts

```bash
npm run dev        # Start development server with nodemon
npm start          # Start production server
```

---

## 🤝 Contributing

For development:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update Swagger documentation (JSDoc comments)
6. Submit a pull request

### Adding New Endpoints

When adding new routes, document them with Swagger JSDoc:

```javascript
/**
 * @swagger
 * /api/v1/your-endpoint:
 *   post:
 *     summary: Endpoint description
 *     tags: [YourCategory]
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
router.post("/your-endpoint", handler);
```

Documentation will update automatically!

---

## 🐛 Troubleshooting

### Common Issues

**Server won't start:**

- Check MongoDB connection string
- Verify all environment variables are set
- Check port 3000 is available

**Authentication errors:**

- Ensure JWT secrets are set in .env
- Check token format: `Bearer <token>`
- Verify token hasn't expired

**File upload fails:**

- Verify Cloudinary credentials
- Check file size limits
- Ensure correct field names

**PhonePe payment issues:**

- Verify merchant credentials
- Check callback URL is accessible
- Use ngrok for local testing
- See [PhonePe Testing Guide](./PHONEPE_TESTING_GUIDE.md)

---

## 📝 License

ISC License

---

## 📧 Support

For questions or issues:

- Check the [Swagger Documentation](http://localhost:3000/api-docs)
- Review the [API Documentation Guide](./API_DOCUMENTATION_GUIDE.md)
- See [PhonePe Integration Guide](./PHONEPE_INTEGRATION.md) for payment issues

---

## 🎉 Features Summary

✅ 16 fully documented API endpoints
✅ Interactive Swagger UI documentation
✅ JWT authentication with refresh tokens
✅ PhonePe payment gateway integration
✅ Cloudinary image upload support
✅ Product variants with stock management
✅ Order processing with multiple payment methods
✅ Review and rating system
✅ Address management
✅ Input validation on all endpoints
✅ Production-ready with comprehensive error handling

---

**Built with ❤️ using Node.js, Express, and MongoDB**

**Start exploring:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs) 🚀
