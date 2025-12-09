# Backend & Database Architecture

## 🏗️ Architecture Overview

This backend uses a **feature-based modular architecture** with clear separation of concerns:

- **Feature Modules**: Each domain (product, order, cart, etc.) is self-contained
- **Service Layer**: All business logic in services (reusable by storefront & admin)
- **Repository Pattern**: Database operations abstracted in repositories
- **Domain Rules**: Pure business logic functions (no dependencies)
- **Unified Responses**: Standardized API responses and error handling

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── core/                          # Core infrastructure
│   │   ├── ApiResponse.js            # Unified response handler
│   │   ├── ApiError.js                # Custom error class
│   │   ├── BaseRepository.js          # Base repository class
│   │   └── middleware/
│   │       ├── errorMiddleware.js    # Global error handler
│   │       ├── asyncHandler.js       # Async route wrapper
│   │       └── validator.js          # Validation middleware
│   │
│   ├── features/                      # Feature-based modules
│   │   ├── product/
│   │   │   ├── product.model.js       # Mongoose schema
│   │   │   ├── product.repository.js  # Database operations
│   │   │   ├── product.service.js     # Business logic
│   │   │   ├── product.controller.js  # Storefront HTTP handlers
│   │   │   ├── product.admin.controller.js  # Admin HTTP handlers
│   │   │   ├── product.routes.js      # Storefront routes
│   │   │   ├── product.admin.routes.js # Admin routes
│   │   │   ├── product.validation.js  # Validation schemas
│   │   │   └── rules/                 # Domain rules
│   │   │       ├── pricing.rules.js
│   │   │       └── inventory.rules.js
│   │   │
│   │   ├── category/                  # Category module
│   │   ├── variant/                    # Variant module
│   │   ├── cart/                       # Cart module
│   │   ├── order/                      # Order module
│   │   │   └── rules/
│   │   │       ├── order.rules.js
│   │   │       └── discount.rules.js
│   │   ├── payment/                    # Payment module
│   │   ├── user/ (auth)                # Authentication module
│   │   ├── address/                    # Address module
│   │   ├── review/                     # Review module
│   │   └── cms/                        # CMS module (isolated)
│   │       ├── cms.service.js
│   │       ├── cms.admin.controller.js
│   │       └── cms.admin.routes.js
│   │
│   ├── shared/                         # Shared utilities
│   │   ├── services/
│   │   │   ├── emailService.js
│   │   │   ├── ratingService.js
│   │   │   └── cacheService.js        # Redis (optional)
│   │   ├── queues/                     # BullMQ queues (optional)
│   │   ├── events/                     # Event emitters (optional)
│   │   └── webhooks/                   # Webhook handlers (optional)
│   │
│   ├── config/                         # Configuration
│   │   ├── cloudinary.js
│   │   ├── phonepe.js
│   │   ├── razorpay.js
│   │   └── swagger.js
│   │
│   ├── middlewares/                    # Global middlewares
│   │   ├── authMiddleware.js
│   │   ├── adminMiddleware.js
│   │   └── rateLimiter.js             # Rate limiting (optional)
│   │
│   ├── models/                         # Legacy models (during migration)
│   │   ├── Homepage.js
│   │   ├── About.js
│   │   ├── Policy.js
│   │   ├── Header.js
│   │   ├── Footer.js
│   │   └── ... (other models)
│   │
│   ├── app.js                          # Express app setup
│   └── server.js                       # Server entry point
│
└── package.json
```

---

## 🏛️ Architecture Layers

### Layer 1: Routes (HTTP Layer)

- **Purpose**: Define API endpoints
- **Files**: `*.routes.js`, `*.admin.routes.js`
- **Responsibilities**:
  - Route definition
  - Middleware application (auth, validation)
  - Request routing

### Layer 2: Controllers (Request/Response Layer)

- **Purpose**: Handle HTTP requests and format responses
- **Files**: `*.controller.js`, `*.admin.controller.js`
- **Responsibilities**:
  - Extract request data
  - Call services
  - Format responses with ApiResponse
- **Rule**: Zero business logic

### Layer 3: Services (Business Logic Layer)

- **Purpose**: Contains all business logic
- **Files**: `*.service.js`
- **Responsibilities**:
  - Business rules enforcement
  - Data transformation
  - Orchestrating repositories
  - Calling domain rules
- **Rule**: Reusable by both storefront and admin

### Layer 4: Repositories (Data Access Layer)

- **Purpose**: Abstract database operations
- **Files**: `*.repository.js`
- **Responsibilities**:
  - Database queries
  - Data persistence
  - Query optimization
- **Rule**: Only database operations

### Layer 5: Domain Rules (Pure Business Logic)

- **Purpose**: Pure business logic functions
- **Files**: `rules/*.rules.js`
- **Responsibilities**:
  - Business calculations
  - Validation rules
  - Domain-specific logic
- **Rule**: No dependencies on Express, MongoDB, or external services

### Layer 6: Models (Data Schema)

- **Purpose**: Define data structure
- **Files**: `*.model.js`
- **Responsibilities**:
  - Mongoose schemas
  - Data validation
  - Indexes

---

## 🗄️ Database Architecture (MongoDB)

### Collections & Models

#### 1. **User Management**

- **Collection**: `users`
- **Model**: `User` (`features/user/user.model.js`)
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
- **Model**: `Product` (`features/product/product.model.js`)
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
- **Model**: `Variant` (`features/variant/variant.model.js`)
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
- **Model**: `Category` (`features/category/category.model.js`)
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
- **Model**: `Cart` (`features/cart/cart.model.js`)
- **Fields**:
  - `cartId` (unique identifier)
  - `userId` (ObjectId ref: User, optional)
  - `items` (array of cart items)
  - `expiresAt` (TTL index for auto-cleanup)
  - `createdAt`, `updatedAt`

#### 5. **Order Management**

- **Collection**: `orders`
- **Model**: `Order` (`features/order/order.model.js`)
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
- **Model**: `Payment` (`features/payment/payment.model.js`)
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
- **Model**: `Address` (`features/address/address.model.js`)
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
- **Model**: `Review` (`features/review/review.model.js`)
- **Fields**:
  - `userId` (ObjectId ref: User)
  - `variantId` (ObjectId ref: Variant)
  - `orderId` (ObjectId ref: Order)
  - `rating` (1-5)
  - `comment` (optional)
  - `createdAt`, `updatedAt`

#### 9. **Content Management System (CMS)**

- **Collection**: `homepage`
- **Model**: `Homepage` (`models/Homepage.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `about`
- **Model**: `About` (`models/About.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `policy`
- **Model**: `Policy` (`models/Policy.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `headerData`
- **Model**: `Header` (`models/Header.js`)
- **Schema**: Flexible (strict: false)

- **Collection**: `footerData`
- **Model**: `Footer` (`models/Footer.js`)
- **Schema**: Flexible (strict: false)

#### 10. **Authentication & Security**

- **Collection**: `tokens`
- **Model**: `Token` (`models/token.js`)
- **Fields**:

  - `userId` (ObjectId ref: User)
  - `token` (refresh token)
  - `expiresAt`
  - `createdAt`

- **Collection**: `pendingusers`
- **Model**: `PendingUser` (`models/PendingUser.js`)
- **Fields**:
  - `email`, `username`, `password`
  - `otp`, `otpExpires` (TTL index)
  - `createdAt`, `updatedAt`

---

## 🛣️ API Routes Structure

### Public Routes (Storefront)

```
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
/api/v1/auth/*              # Authentication
```

### Admin Routes

```
/api/v1/admin/products/*    # Product management
/api/v1/admin/categories/*  # Category management
/api/v1/admin/orders/*      # Order management
/api/v1/admin/cms/*         # CMS management
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
3. **Validation Middleware**: Input validation using express-validator

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

1. **Feature-Based Modular Architecture**: Each domain is self-contained
2. **Service Layer**: All business logic in services (reusable)
3. **Repository Pattern**: Database operations abstracted
4. **Domain Rules**: Pure business logic functions
5. **Unified Responses**: Standardized API responses
6. **Error Handling**: Centralized error responses
7. **Flexible Schemas**: CMS models use `strict: false` for dynamic content

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
Validation Middleware
    ↓
Auth Middleware (if protected)
    ↓
Admin Middleware (if admin route)
    ↓
Controller (HTTP handling only)
    ↓
Service (Business logic)
    ↓
Domain Rules (Pure logic)
    ↓
Repository (Database operations)
    ↓
Database (MongoDB)
    ↓
Response (ApiResponse format)
    ↓
Error Middleware (if error)
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
- `express-validator`: Input validation

---

## 🎯 Service Reusability Pattern

### Example: Same Service, Different Controllers

**Storefront Controller:**

```javascript
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, {
    isAdmin: false,
  });
  // Only published products
});
```

**Admin Controller:**

```javascript
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, {
    isAdmin: true,
  });
  // All products including drafts
});
```

**Service (Shared):**

```javascript
async getAllProducts(filters, options = {}) {
  const filter = {};
  if (!options.isAdmin) {
    filter.status = "published"; // Storefront only
  }
  // ... rest of logic
}
```

---

## 📋 Standardized Response Format

### Success Response

```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "statusCode": 422,
  "errors": [
    {
      "field": "title",
      "message": "Title is required",
      "value": null
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 🚀 Scalability Enhancements (Optional)

### 1. Redis Caching

- Cache frequently accessed data
- Invalidate on updates
- Reduce database load

### 2. BullMQ Queues

- Background job processing
- Email sending
- Order processing
- Image processing

### 3. Event Emitters

- Decouple components
- Order events
- Payment events
- User events

### 4. Rate Limiting

- Protect APIs from abuse
- Per-IP or per-user limits
- Configurable thresholds

### 5. Webhook Handlers

- Payment gateway callbacks
- Third-party integrations
- Async processing

---

## 📚 Additional Documentation

- **ARCHITECTURE_NEW.md**: Detailed new architecture guide
- **MIGRATION_GUIDE.md**: Step-by-step migration instructions
- **API Documentation**: Available at `/api-docs`

---

This architecture supports a scalable e-commerce platform with feature-based modularity, clear separation of concerns, and enterprise-ready patterns.
