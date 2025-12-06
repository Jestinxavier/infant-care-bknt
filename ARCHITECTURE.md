# Backend & Database Architecture

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.js                 # Express app configuration
│   ├── server.js              # Server entry point & DB connection
│   ├── config/                # Configuration files
│   │   ├── cloudinary.js      # Image upload configuration
│   │   ├── phonepe.js         # PhonePe payment gateway config
│   │   ├── razorpay.js        # Razorpay payment gateway config
│   │   └── swagger.js         # API documentation config
│   ├── controllers/           # Business logic layer
│   │   ├── address/           # Address management
│   │   ├── admin/             # Admin-specific operations
│   │   ├── auth/              # Authentication & authorization
│   │   ├── cart/              # Shopping cart operations
│   │   ├── category/          # Category management
│   │   ├── cms/               # Content Management System
│   │   ├── filter/            # Product filtering
│   │   ├── health/            # Health check endpoints
│   │   ├── homepage/          # Homepage content
│   │   ├── Order/             # Order management
│   │   ├── payment/           # Payment processing
│   │   ├── product/           # Product management
│   │   ├── review/            # Product reviews
│   │   └── Variant/           # Product variants
│   ├── middlewares/           # Request middleware
│   │   ├── adminMiddleware.js # Admin role verification
│   │   ├── authMiddleware.js  # JWT token verification
│   │   └── validators.js      # Input validation
│   ├── models/                # Mongoose schemas (Database models)
│   ├── routes/                # API route definitions
│   ├── services/              # External service integrations
│   │   ├── emailService.js    # Email sending service
│   │   ├── ratingService.js   # Rating calculation service
│   │   └── service.js         # General service utilities
│   └── utils/                 # Helper functions
│       ├── cartIdGenerator.js
│       ├── formatCartResponse.js
│       ├── slugGenerator.js
│       └── ...
└── package.json
```

---

## 🗄️ Database Architecture (MongoDB)

### Collections & Models

#### 1. **User Management**
- **Collection**: `users`
- **Model**: `User` (`src/models/user.js`)
- **Fields**:
  - `username` (unique, required)
  - `email` (unique, required)
  - `phone` (optional)
  - `password` (hashed with bcrypt)
  - `role` (enum: "user", "admin", "super-admin", "moderator")
  - `isEmailVerified` (boolean)
  - `emailOTP`, `emailOTPExpires`
  - `resetPasswordToken`, `resetPasswordExpires`
  - `avatar` (URL)
  - `createdAt`, `updatedAt`

#### 2. **Product Management**
- **Collection**: `products`
- **Model**: `Product` (`src/models/Product.js`)
- **Fields**:
  - `title`, `description`
  - `category` (ObjectId ref: Category)
  - `url_key` (unique slug)
  - `status` (enum: "draft", "published", "archived")
  - `variantOptions` (array of option definitions)
  - `variants` (embedded array of variant objects)
  - `details` (array of detail sections)
  - `images` (array of image URLs)
  - `createdAt`, `updatedAt`

- **Collection**: `variants`
- **Model**: `Variant` (`src/models/Variant.js`)
- **Fields**:
  - `productId` (ObjectId ref: Product)
  - `color`, `age`
  - `price`, `stock`
  - `sku` (unique)
  - `images` (array)
  - `averageRating`, `totalReviews`
  - `createdAt`, `updatedAt`

#### 3. **Category Management**
- **Collection**: `categories`
- **Model**: `Category` (`src/models/Category.js`)
- **Fields**:
  - `name` (unique, required)
  - `slug` (auto-generated from name)
  - `description`
  - `image` (URL)
  - `isActive` (boolean)
  - `displayOrder` (number)
  - `parentCategory` (ObjectId ref: Category, optional)
  - `createdAt`, `updatedAt`

#### 4. **Shopping Cart**
- **Collection**: `carts`
- **Model**: `Cart` (`src/models/Cart.js`)
- **Fields**:
  - `cartId` (unique identifier)
  - `userId` (ObjectId ref: User, optional)
  - `items` (array of cart items)
  - `expiresAt` (TTL index for auto-cleanup)
  - `createdAt`, `updatedAt`

#### 5. **Order Management**
- **Collection**: `orders`
- **Model**: `Order` (`src/models/Order.js`)
- **Fields**:
  - `userId` (ObjectId ref: User)
  - `items` (array of order items)
  - `totalAmount`, `subtotal`
  - `shippingCost`, `discount`
  - `addressId` (ObjectId ref: Address)
  - `paymentStatus` (enum: "pending", "paid", "failed", "refunded")
  - `orderStatus` (enum: "processing", "shipped", "delivered", "cancelled")
  - `paymentMethod` (enum: "COD", "Razorpay", "Stripe", "PhonePe")
  - `placedAt`, `createdAt`, `updatedAt`

#### 6. **Payment Management**
- **Collection**: `payments`
- **Model**: `Payment` (`src/models/Payment.js`)
- **Fields**:
  - `orderId` (ObjectId ref: Order)
  - `userId` (ObjectId ref: User)
  - `amount`
  - `paymentMethod`
  - `paymentStatus`
  - `transactionId`
  - `paymentGateway` (enum: "razorpay", "phonepe", "stripe", "cod")
  - `gatewayResponse` (object)
  - `createdAt`, `updatedAt`

#### 7. **Address Management**
- **Collection**: `addresses`
- **Model**: `Address` (`src/models/Address.js`)
- **Fields**:
  - `userId` (ObjectId ref: User)
  - `fullName`, `phone`
  - `addressLine1`, `addressLine2`
  - `city`, `state`, `pincode`, `country`
  - `isDefault` (boolean)
  - `addressType` (enum: "home", "work", "other")
  - `createdAt`, `updatedAt`

#### 8. **Review & Rating**
- **Collection**: `reviews`
- **Model**: `Review` (`src/models/Review.js`)
- **Fields**:
  - `userId` (ObjectId ref: User)
  - `variantId` (ObjectId ref: Variant)
  - `orderId` (ObjectId ref: Order)
  - `rating` (1-5)
  - `comment` (optional)
  - `createdAt`, `updatedAt`

#### 9. **Content Management System (CMS)**
- **Collection**: `homepage`
- **Model**: `Homepage` (`src/models/Homepage.js`)
- **Schema**: Flexible (strict: false) - allows dynamic fields

- **Collection**: `about`
- **Model**: `About` (`src/models/About.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `policy`
- **Model**: `Policy` (`src/models/Policy.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `headerData`
- **Model**: `Header` (`src/models/Header.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `footerData`
- **Model**: `Footer` (`src/models/Footer.js`)
- **Schema**: Flexible (strict: false)

#### 10. **Authentication & Security**
- **Collection**: `tokens`
- **Model**: `Token` (`src/models/token.js`)
- **Fields**:
  - `userId` (ObjectId ref: User)
  - `token` (refresh token)
  - `expiresAt`
  - `createdAt`

- **Collection**: `pendingusers`
- **Model**: `PendingUser` (`src/models/PendingUser.js`)
- **Fields**:
  - `email`, `username`, `password`
  - `otp`, `otpExpires` (TTL index)
  - `createdAt`, `updatedAt`

---

## 🛣️ API Routes Structure

### Public Routes (Storefront)
```
/api/v1/auth/*              # Authentication
/api/v1/product/*           # Product listing & details
/api/v1/category/*          # Category listing
/api/v1/variants/*          # Variant operations
/api/v1/filter/*            # Product filtering
/api/v1/cart/*              # Shopping cart
/api/v1/orders/*            # Order operations (authenticated)
/api/v1/addresses/*         # Address management (authenticated)
/api/v1/review/*            # Reviews
/api/v1/payments/*          # Payment processing
/api/v1/health/*            # Health checks
/api/v1/homepage/*          # Homepage content
```

### Admin Routes
```
/api/v1/admin/*             # Admin operations (products, orders, categories)
/api/v1/admin/cms/*         # CMS management (home, about, policies, header, footer)
```

### Documentation
```
/api-docs                   # Swagger UI documentation
```

---

## 🔐 Authentication & Authorization

### Authentication Flow
1. **Registration**: Email/Phone OTP verification
2. **Login**: JWT-based (access token + refresh token)
3. **Token Storage**: 
   - Access token: Client-side cookie
   - Refresh token: HttpOnly cookie (server-side)

### Middleware Chain
1. **authMiddleware** (`verifyToken`): Validates JWT token
2. **adminMiddleware** (`requireAdmin`): Verifies admin role
3. **Validators**: Input validation using express-validator

### Role-Based Access
- **User**: Can access storefront APIs
- **Admin/Super-Admin**: Can access admin APIs + CMS

---

## 🔄 Key Features

### 1. **Hybrid Cart System**
- Supports both authenticated users and guests
- Cart ID stored in header (`x-cart-id`) or cookie
- TTL-based auto-cleanup for abandoned carts

### 2. **Payment Integration**
- **Razorpay**: Credit/Debit cards, UPI, Wallets
- **PhonePe**: UPI payments
- **COD**: Cash on Delivery
- Webhook support for payment callbacks

### 3. **Image Management**
- Cloudinary integration for image uploads
- Automatic optimization and transformation
- Support for product images, category images, avatars

### 4. **Email Service**
- Nodemailer with Gmail SMTP
- OTP emails, password reset, order confirmations
- HTML email templates

### 5. **Rating System**
- Product variant-level ratings
- Average rating calculation
- Review verification (order-based)

---

## 🚀 Deployment

### Serverless (Vercel)
- Connection pooling for MongoDB
- Optimized for cold starts
- Environment-based configuration

### Traditional (Render/Heroku)
- Standard MongoDB connection
- Persistent server instance
- Environment variables from `.env`

---

## 📊 Database Indexes

### Optimized Indexes
- `users`: `email` (unique), `username` (unique)
- `products`: `url_key` (unique), `category`, `status`
- `variants`: `productId`, `sku` (unique)
- `categories`: `isActive`, `displayOrder`
- `carts`: `userId`, `cartId`, `expiresAt` (TTL)
- `orders`: `userId`, `orderStatus`, `paymentStatus`
- `addresses`: `userId`, `isDefault`
- `reviews`: `variantId`, `userId`
- `tokens`: `userId`, `expiresAt`
- `pendingusers`: `otpExpires` (TTL)

---

## 🔧 Configuration

### Environment Variables
- `MONGODB_URI`: MongoDB connection string
- `JWT_ACCESS_SECRET`: JWT signing secret
- `JWT_REFRESH_SECRET`: Refresh token secret
- `CLOUDINARY_*`: Cloudinary credentials
- `RAZORPAY_*`: Razorpay credentials
- `PHONEPE_*`: PhonePe credentials
- `EMAIL_*`: Email service configuration
- `FRONTEND_URL`: Frontend origin for CORS
- `ADMIN_API_PREFIX`: Admin route prefix (default: "/admin")

---

## 📝 API Documentation

- **Swagger UI**: Available at `/api-docs`
- **OpenAPI 3.0**: Auto-generated from JSDoc comments
- **Tags**: Organized by feature (Auth, Products, Orders, Admin, etc.)

---

## 🏗️ Architecture Patterns

1. **MVC Pattern**: Models, Controllers, Routes separation
2. **Middleware Chain**: Request → Auth → Validation → Controller
3. **Service Layer**: External integrations abstracted
4. **Repository Pattern**: Models handle data access
5. **Error Handling**: Centralized error responses
6. **Flexible Schemas**: CMS models use `strict: false` for dynamic content

---

## 🔄 Data Flow

```
Client Request
    ↓
CORS Middleware
    ↓
Cookie Parser
    ↓
JSON Parser
    ↓
Route Handler
    ↓
Auth Middleware (if protected)
    ↓
Admin Middleware (if admin route)
    ↓
Controller
    ↓
Service/Model
    ↓
Database (MongoDB)
    ↓
Response
```

---

## 📦 Dependencies

### Core
- `express`: Web framework
- `mongoose`: MongoDB ODM
- `jsonwebtoken`: JWT authentication
- `bcryptjs`: Password hashing

### Payment
- `razorpay`: Razorpay SDK
- Custom PhonePe integration

### Media
- `cloudinary`: Image management
- `multer`: File upload handling

### Utilities
- `dotenv`: Environment variables
- `cors`: Cross-origin resource sharing
- `cookie-parser`: Cookie handling
- `swagger-ui-express`: API documentation
- `swagger-jsdoc`: Swagger from JSDoc

---

This architecture supports a scalable e-commerce platform with separate models for each content type, flexible CMS management, and comprehensive admin controls.

