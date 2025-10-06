

# Authentication API — README



## Backend Introduction — Infant Care E-Commerce Platform

The backend of the Infant Care E-Commerce Platform is designed to provide a **secure, scalable, and high-performance foundation** for the platform’s customer-facing and management functionalities. Built with **Node.js** and **Express**, the backend handles all critical operations including user authentication, product and inventory management, order processing, discount management, and integration with secure payment gateways.

The system uses **MongoDB** as the database to ensure flexible data storage for products, users, orders, and other platform entities. The backend also provides **RESTful APIs** for seamless communication with the Next.js frontend, supporting features such as:

* User registration, login, and authentication with **JWT access and refresh tokens**
* Product catalog management with variants, filters, and search
* Cart and checkout operations, including payment processing and shipping selection
* Admin and Super Admin panels for order tracking, product management, discount setup, and user management
* Bulk product upload and reporting capabilities
* Secure and scalable architecture ready for cloud deployment on AWS, Vercel, or DigitalOcean

The backend is built with **best practices in security, modular architecture, and maintainability**, ensuring that the platform can grow with future business needs while providing a smooth and reliable experience for both customers and administrators.




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

* `400` if username or email already exists
* `400` if validation fails

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
  "msg": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Notes:**

* Refresh token is stored in HttpOnly cookie for security
* Use access token in `Authorization: Bearer <token>` header for protected routes

---

### 3. **Refresh Access Token**

**Endpoint:** `/refresh`
**Method:** `POST`
**Description:** Generates a new access token using the refresh token stored in HttpOnly cookie.

**Request:**

* No body required
* Must send **cookie** with request (`credentials: 'include'` in fetch/axios)

**Response (Success 200):**

```json
{
  "accessToken": "new-access-token"
}
```

**Errors:**

* `401` if no refresh token cookie present
* `403` if refresh token is invalid or expired

---

### 4. **Logout User**

**Endpoint:** `/logout`
**Method:** `POST`
**Description:** Deletes the refresh token from the database and clears the cookie, effectively logging the user out.

**Request:**

* Must send **cookie** with refresh token

**Response (Success 200):**

```json
{
  "msg": "Logout successful"
}
```

---

## Security Notes

* **Passwords** are hashed with `bcryptjs`
* **Access tokens** are short-lived JWTs, stored in **memory** in the frontend
* **Refresh tokens** are long-lived JWTs stored in **HttpOnly cookies**
* All routes support **JWT-based authentication** for secure access to protected resources

---

## Example Usage in React (Frontend)

```js
const res = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
  credentials: "include" // important to send HttpOnly cookie
});

const data = await res.json();
const accessToken = data.accessToken; // store in memory
```

---

## Dependencies

* express
* bcryptjs
* jsonwebtoken
* mongoose
* cookie-parser

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

* **Fields validated:**

  * `username` → required, min 3 characters
  * `email` → required, valid email format
  * `password` → required, min 6 characters

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
    { "msg": "Username must be at least 3 characters", "param": "username" },
    { "msg": "Invalid email format", "param": "email" },
    { "msg": "Password must be at least 6 characters", "param": "password" }
  ]
}
```

---

### 2️ **Login Validation**

* **Fields validated:**

  * `email` → required, valid email
  * `password` → required

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
    { "msg": "Email is required", "param": "email" },
    { "msg": "Password is required", "param": "password" }
  ]
}
```

---

### 3️ **Usage in Routes**

```js
const { registerValidation, loginValidation, validate } = require("../middleware/validators");

router.post("/register", registerValidation, validate, register);
router.post("/login", loginValidation, validate, login);
```

> All invalid input is rejected **before reaching the controller**, ensuring only clean data enters the database.

---


---

## Product & Variant Example (Scalable Model)

In this scalable model, each product has a **single Product document**, and its **variants are stored in a separate collection**. This allows for multiple variants per product, multiple images per variant, and flexible stock/price management.

### **1️⃣ Product Creation**

```javascript
const product = await Product.create({
  name: "Floral Summer Dress",
  description: "A beautiful floral dress perfect for summer outings",
  category: "Dresses",
  tags: ["summer", "floral", "casual"],
  basePrice: 500
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

### **2️⃣ Variant Creation**

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
      "https://example.com/images/floral-red-back.jpg"
    ]
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
      "https://example.com/images/floral-red-back.jpg"
    ]
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
      "https://example.com/images/floral-blue-back.jpg"
    ]
  }
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

### **3️⃣ How It Works**

* **Product** document stores general info about the item (name, category, description).
* **Variant** documents store **specific combinations** (size, color), their price, stock, SKU, and images.
* **Frontend usage:** Fetch product + variants using `productId` to display all options on a single product page.

**Benefits of this approach:**

* Supports **multiple variants per product**
* Multiple images per variant
* Flexible **stock and pricing** per variant
* Scalable for large catalogs 

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
  "msg": "Product and variants created successfully"
}
```

---

### **Notes**

* Field names must exactly match your variant’s `sku` value (e.g., `images-<SKU>`).
* Each variant’s images are uploaded to Cloudinary inside the `products/` folder.
* The backend automatically maps each uploaded file to its matching variant.

---



---

This README explains all the endpoints and how to use them.

---



