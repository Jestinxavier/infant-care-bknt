

# Authentication API — README

## Overview

This module provides authentication endpoints for user registration, login, token refresh, and logout. It uses **JWT** for access and refresh tokens, **bcrypt** for password hashing, and supports secure refresh tokens via HttpOnly cookies.

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

### 1️⃣ **Register Validation**

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

### 2️⃣ **Login Validation**

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

### 3️⃣ **Usage in Routes**

```js
const { registerValidation, loginValidation, validate } = require("../middleware/validators");

router.post("/register", registerValidation, validate, register);
router.post("/login", loginValidation, validate, login);
```

> All invalid input is rejected **before reaching the controller**, ensuring only clean data enters the database.

---


---

This README explains all the endpoints and how to use them.

---



