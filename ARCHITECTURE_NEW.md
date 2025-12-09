# New Modular Architecture - Feature-Based Structure

## 📁 Complete Folder Structure

```
backend/
├── src/
│   ├── core/                          # Core infrastructure (shared across all features)
│   │   ├── ApiResponse.js            # Unified response handler
│   │   ├── ApiError.js                # Custom error class
│   │   ├── BaseRepository.js          # Base repository with common DB operations
│   │   └── middleware/
│   │       ├── errorMiddleware.js    # Global error handler
│   │       ├── asyncHandler.js        # Async route wrapper
│   │       └── validator.js           # Validation middleware
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
│   │   │   └── rules/                 # Domain rules (pure logic)
│   │   │       ├── pricing.rules.js
│   │   │       └── inventory.rules.js
│   │   │
│   │   ├── category/
│   │   │   ├── category.model.js
│   │   │   ├── category.repository.js
│   │   │   ├── category.service.js
│   │   │   ├── category.controller.js
│   │   │   ├── category.admin.controller.js
│   │   │   ├── category.routes.js
│   │   │   ├── category.admin.routes.js
│   │   │   └── category.validation.js
│   │   │
│   │   ├── variant/
│   │   │   ├── variant.model.js
│   │   │   ├── variant.repository.js
│   │   │   ├── variant.service.js
│   │   │   ├── variant.controller.js
│   │   │   ├── variant.admin.controller.js
│   │   │   ├── variant.routes.js
│   │   │   ├── variant.admin.routes.js
│   │   │   └── variant.validation.js
│   │   │
│   │   ├── cart/
│   │   │   ├── cart.model.js
│   │   │   ├── cart.repository.js
│   │   │   ├── cart.service.js
│   │   │   ├── cart.controller.js
│   │   │   ├── cart.routes.js
│   │   │   └── cart.validation.js
│   │   │
│   │   ├── order/
│   │   │   ├── order.model.js
│   │   │   ├── order.repository.js
│   │   │   ├── order.service.js
│   │   │   ├── order.controller.js
│   │   │   ├── order.admin.controller.js
│   │   │   ├── order.routes.js
│   │   │   ├── order.admin.routes.js
│   │   │   ├── order.validation.js
│   │   │   └── rules/
│   │   │       ├── order.rules.js
│   │   │       └── discount.rules.js
│   │   │
│   │   ├── payment/
│   │   │   ├── payment.model.js
│   │   │   ├── payment.repository.js
│   │   │   ├── payment.service.js
│   │   │   ├── payment.controller.js
│   │   │   ├── payment.admin.controller.js
│   │   │   ├── payment.routes.js
│   │   │   ├── payment.admin.routes.js
│   │   │   └── payment.validation.js
│   │   │
│   │   ├── user/ (auth)
│   │   │   ├── user.model.js
│   │   │   ├── user.repository.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.admin.controller.js
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.admin.routes.js
│   │   │   └── auth.validation.js
│   │   │
│   │   ├── address/
│   │   │   ├── address.model.js
│   │   │   ├── address.repository.js
│   │   │   ├── address.service.js
│   │   │   ├── address.controller.js
│   │   │   ├── address.routes.js
│   │   │   └── address.validation.js
│   │   │
│   │   ├── review/
│   │   │   ├── review.model.js
│   │   │   ├── review.repository.js
│   │   │   ├── review.service.js
│   │   │   ├── review.controller.js
│   │   │   ├── review.routes.js
│   │   │   └── review.validation.js
│   │   │
│   │   └── cms/                        # Fully isolated CMS module
│   │       ├── cms.service.js          # CMS business logic
│   │       ├── cms.admin.controller.js # CMS admin controller
│   │       └── cms.admin.routes.js     # CMS admin routes
│   │
│   ├── shared/                         # Shared utilities and services
│   │   ├── services/
│   │   │   ├── emailService.js
│   │   │   ├── ratingService.js
│   │   │   └── cacheService.js        # Redis caching (optional)
│   │   ├── queues/
│   │   │   ├── orderQueue.js           # BullMQ queue (optional)
│   │   │   └── emailQueue.js
│   │   ├── events/
│   │   │   ├── eventEmitter.js        # Event system (optional)
│   │   │   └── orderEvents.js
│   │   └── webhooks/
│   │       ├── webhookHandler.js     # Webhook processing (optional)
│   │       └── paymentWebhooks.js
│   │
│   ├── config/                         # Configuration files
│   │   ├── cloudinary.js
│   │   ├── phonepe.js
│   │   ├── razorpay.js
│   │   ├── swagger.js
│   │   ├── redis.js                   # Redis config (optional)
│   │   └── bullmq.js                  # BullMQ config (optional)
│   │
│   ├── middlewares/                    # Global middlewares
│   │   ├── authMiddleware.js
│   │   ├── adminMiddleware.js
│   │   └── rateLimiter.js             # Rate limiting (optional)
│   │
│   ├── models/                         # Legacy models (during migration)
│   │   └── ... (to be migrated to features/)
│   │
│   ├── app.js                          # Express app setup
│   └── server.js                       # Server entry point
│
└── package.json
```

---

## 🏗️ Architecture Layers

### Layer 1: Routes (HTTP Layer)
- **Purpose**: Define API endpoints and HTTP methods
- **Responsibilities**:
  - Route definition
  - Middleware application (auth, validation)
  - Request/response handling
- **Files**: `*.routes.js`, `*.admin.routes.js`

### Layer 2: Controllers (Request/Response Layer)
- **Purpose**: Handle HTTP requests and format responses
- **Responsibilities**:
  - Extract data from requests
  - Call services
  - Format responses using ApiResponse
  - Handle errors
- **Files**: `*.controller.js`, `*.admin.controller.js`
- **Rule**: Zero business logic - only HTTP concerns

### Layer 3: Services (Business Logic Layer)
- **Purpose**: Contains all business logic
- **Responsibilities**:
  - Business rules enforcement
  - Data transformation
  - Orchestrating multiple repositories
  - Calling domain rules
- **Files**: `*.service.js`
- **Rule**: Reusable by both storefront and admin controllers

### Layer 4: Repositories (Data Access Layer)
- **Purpose**: Abstract database operations
- **Responsibilities**:
  - Database queries
  - Data persistence
  - Query optimization
- **Files**: `*.repository.js`
- **Rule**: Only database operations, no business logic

### Layer 5: Domain Rules (Pure Business Logic)
- **Purpose**: Pure business logic functions
- **Responsibilities**:
  - Business calculations
  - Validation rules
  - Domain-specific logic
- **Files**: `rules/*.rules.js`
- **Rule**: No dependencies on Express, MongoDB, or external services

### Layer 6: Models (Data Schema)
- **Purpose**: Define data structure
- **Responsibilities**:
  - Mongoose schemas
  - Data validation at schema level
  - Indexes
- **Files**: `*.model.js`

---

## 📊 Data Flow Example: Creating a Product

```
1. HTTP Request
   POST /api/v1/admin/products
   ↓
2. Route Handler (product.admin.routes.js)
   - Apply auth middleware
   - Apply validation middleware
   - Call controller
   ↓
3. Controller (product.admin.controller.js)
   - Extract req.body
   - Call productService.createProduct()
   - Format response with ApiResponse
   ↓
4. Service (product.service.js)
   - Validate business rules (pricing, inventory)
   - Call domain rules (pricing.rules.js, inventory.rules.js)
   - Call repository to save
   ↓
5. Repository (product.repository.js)
   - Execute database operation
   - Return result
   ↓
6. Service returns to Controller
   ↓
7. Controller formats response
   ↓
8. HTTP Response
   {
     "success": true,
     "message": "Product created successfully",
     "data": { ... },
     "timestamp": "2024-01-01T00:00:00.000Z"
   }
```

---

## 🔄 Service Reusability Pattern

### Example: ProductService used by both controllers

```javascript
// product.service.js
class ProductService {
  async getAllProducts(filters, options = {}) {
    // Business logic here
    // options.isAdmin determines if drafts are included
    const filter = {};
    if (!options.isAdmin) {
      filter.status = "published"; // Storefront only sees published
    }
    // ... rest of logic
  }
}

// product.controller.js (Storefront)
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, { isAdmin: false });
  // Only published products
});

// product.admin.controller.js (Admin)
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, { isAdmin: true });
  // All products including drafts
});
```

---

## 📝 Example: Domain Rule Usage

```javascript
// pricing.rules.js (Pure function, no dependencies)
function validatePricing(regularPrice, discountPrice) {
  if (regularPrice < 0) {
    return { valid: false, error: "Regular price cannot be negative" };
  }
  if (discountPrice > regularPrice) {
    return { valid: false, error: "Discount price cannot exceed regular price" };
  }
  return { valid: true };
}

// product.service.js (Uses the rule)
const { validatePricing } = require("./rules/pricing.rules");

async createProduct(productData) {
  // Use domain rule
  const validation = validatePricing(price, discountPrice);
  if (!validation.valid) {
    throw ApiError.validation(validation.error);
  }
  // ... continue
}
```

---

## 🎯 Standardized API Response Format

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

## 🔐 Admin vs Storefront Separation

### Same Service, Different Controllers

**Storefront Controller:**
- Only calls service with `{ isAdmin: false }`
- Only sees published products
- Limited fields in response

**Admin Controller:**
- Calls service with `{ isAdmin: true }`
- Sees all products (drafts, archived)
- Full fields in response
- Additional admin-only operations

### Example Difference

```javascript
// Storefront: product.controller.js
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, { isAdmin: false });
  // Filters out drafts automatically
});

// Admin: product.admin.controller.js
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, { isAdmin: true });
  // Includes all statuses
});
```

---

## 🚀 Scalability Enhancements (Optional)

### 1. Redis Caching
```javascript
// shared/services/cacheService.js
class CacheService {
  async get(key) { /* Redis GET */ }
  async set(key, value, ttl) { /* Redis SET */ }
  async invalidate(pattern) { /* Redis DEL */ }
}

// Usage in service
const cached = await cacheService.get(`product:${id}`);
if (cached) return cached;
const product = await repository.findById(id);
await cacheService.set(`product:${id}`, product, 3600);
```

### 2. BullMQ Queues
```javascript
// shared/queues/orderQueue.js
const orderQueue = new Queue("order-processing");

// Add job
await orderQueue.add("send-confirmation-email", { orderId });

// Process job
orderQueue.process("send-confirmation-email", async (job) => {
  await emailService.sendOrderConfirmation(job.data.orderId);
});
```

### 3. Event Emitters
```javascript
// shared/events/eventEmitter.js
const EventEmitter = require("events");
const eventEmitter = new EventEmitter();

// Emit event
eventEmitter.emit("order.created", orderData);

// Listen to event
eventEmitter.on("order.created", async (orderData) => {
  await emailService.sendOrderConfirmation(orderData);
});
```

### 4. Rate Limiting
```javascript
// middlewares/rateLimiter.js
const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### 5. Webhook Handlers
```javascript
// shared/webhooks/paymentWebhooks.js
class PaymentWebhookHandler {
  async handleRazorpayWebhook(payload, signature) {
    // Verify signature
    // Process payment update
    // Emit event
  }
}
```

---

## 📋 Migration Strategy

### Phase 1: Core Infrastructure (Week 1)
1. ✅ Create `core/` folder with ApiResponse, ApiError, BaseRepository
2. ✅ Create error middleware
3. ✅ Create async handler wrapper
4. ✅ Update app.js to use error middleware

### Phase 2: Example Feature (Week 1-2)
1. ✅ Migrate Product feature completely
2. ✅ Test all product endpoints
3. ✅ Update Swagger documentation

### Phase 3: Remaining Features (Week 2-4)
1. Migrate Category, Variant, Cart
2. Migrate Order, Payment
3. Migrate User/Auth, Address, Review
4. Migrate CMS (already isolated)

### Phase 4: Cleanup (Week 4)
1. Remove old controllers, routes
2. Update all imports
3. Final testing

---

## ✅ Benefits of New Architecture

1. **Modularity**: Each feature is self-contained
2. **Scalability**: Easy to add new features
3. **Testability**: Services and rules are easily testable
4. **Maintainability**: Clear separation of concerns
5. **Reusability**: Services shared between storefront and admin
6. **Type Safety**: Can easily add TypeScript later
7. **Performance**: Easy to add caching, queues, etc.

---

This architecture provides a solid foundation for enterprise-scale applications while maintaining clean, maintainable code.

