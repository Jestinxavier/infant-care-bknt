# Architecture Examples - Complete Implementation Guide

## 📚 Table of Contents

1. [Complete Feature Example: Product](#complete-feature-example-product)
2. [Controller → Service → Repository Flow](#controller--service--repository-flow)
3. [Domain Rule Example](#domain-rule-example)
4. [Response Format Examples](#response-format-examples)
5. [Validation Schema Example](#validation-schema-example)
6. [Admin vs Storefront Difference](#admin-vs-storefront-difference)
7. [Error Handling Example](#error-handling-example)

---

## Complete Feature Example: Product

### File Structure
```
features/product/
├── product.model.js              # Mongoose schema
├── product.repository.js         # Database operations
├── product.service.js            # Business logic
├── product.controller.js         # Storefront HTTP handlers
├── product.admin.controller.js    # Admin HTTP handlers
├── product.routes.js              # Storefront routes
├── product.admin.routes.js        # Admin routes
├── product.validation.js         # Validation schemas
└── rules/
    ├── pricing.rules.js          # Pricing calculations
    └── inventory.rules.js       # Inventory management
```

### Complete Flow Example

**1. Request comes in:**
```
GET /api/v1/product?page=1&limit=20&category=64abc123
```

**2. Route Handler** (`product.routes.js`):
```javascript
router.get(
  "/",
  validate(productValidation.list),  // Validation middleware
  productController.getAllProducts   // Controller method
);
```

**3. Controller** (`product.controller.js`):
```javascript
getAllProducts = asyncHandler(async (req, res) => {
  // Extract query params
  const filters = req.query;
  
  // Call service (with isAdmin: false for storefront)
  const result = await productService.getAllProducts(filters, { isAdmin: false });
  
  // Format response
  res.status(200).json(
    ApiResponse.paginated(
      "Products fetched successfully",
      result.data,
      result.pagination
    ).toJSON()
  );
});
```

**4. Service** (`product.service.js`):
```javascript
async getAllProducts(filters = {}, options = {}) {
  // Build filter
  const filter = {};
  
  // Business rule: Storefront only sees published products
  if (!options.isAdmin) {
    filter.status = "published";
  } else if (filters.status) {
    filter.status = filters.status; // Admin can filter by status
  }
  
  if (filters.category) {
    filter.category = filters.category;
  }
  
  // Call repository
  const result = await productRepository.findAll(filter, {
    page: filters.page || 1,
    limit: filters.limit || 20,
    populate: [{ path: "category", select: "name slug" }],
  });
  
  return result;
}
```

**5. Repository** (`product.repository.js`):
```javascript
// Extends BaseRepository which has findAll method
async findAll(filter = {}, options = {}) {
  const {
    page = 1,
    limit = 10,
    sort = { createdAt: -1 },
    populate = [],
  } = options;

  const skip = (page - 1) * limit;
  const query = this.model.find(filter);

  if (populate.length > 0) {
    populate.forEach((pop) => {
      query.populate(pop);
    });
  }

  query.sort(sort).skip(skip).limit(limit);

  const [data, total] = await Promise.all([
    query.exec(),
    this.model.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
```

**6. Response:**
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": [...products],
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

---

## Controller → Service → Repository Flow

### Creating a Product (Admin)

**Request:**
```http
POST /api/v1/admin/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Baby Onesie",
  "description": "Comfortable cotton onesie",
  "category": "64abc123",
  "status": "draft",
  "variants": [
    {
      "sku": "ONESIE-001",
      "price": 599,
      "discountPrice": 499,
      "stock": 50
    }
  ]
}
```

**Flow:**

1. **Route** (`product.admin.routes.js`):
   ```javascript
   router.post(
     "/",
     verifyToken,                    // Auth middleware
     requireAdmin,                   // Admin middleware
     validate(productValidation.create), // Validation
     productAdminController.createProduct
   );
   ```

2. **Controller** (`product.admin.controller.js`):
   ```javascript
   createProduct = asyncHandler(async (req, res) => {
     // Extract request body
     const productData = req.body;
     
     // Call service
     const product = await productService.createProduct(productData);
     
     // Format success response
     res.status(201).json(
       ApiResponse.success("Product created successfully", product).toJSON()
     );
   });
   ```

3. **Service** (`product.service.js`):
   ```javascript
   async createProduct(productData) {
     // Business logic: Validate variants
     if (productData.variants && Array.isArray(productData.variants)) {
       for (const variant of productData.variants) {
         // Use domain rule
         const price = variant.pricing?.price || variant.price;
         const discountPrice = variant.pricing?.discountPrice || variant.discountPrice;
         
         const validation = validatePricing(price, discountPrice || price);
         if (!validation.valid) {
           throw ApiError.validation(validation.error);
         }
         
         // Use inventory rule
         const stock = variant.stockObj?.available || variant.stock;
         if (stock !== undefined) {
           const stockValidation = validateStockQuantity(stock);
           if (!stockValidation.valid) {
             throw ApiError.validation(stockValidation.error);
           }
         }
       }
     }
     
     // Call repository
     const product = await productRepository.create(productData);
     return product;
   }
   ```

4. **Domain Rule** (`rules/pricing.rules.js`):
   ```javascript
   function validatePricing(regularPrice, discountPrice) {
     if (regularPrice < 0) {
       return { valid: false, error: "Regular price cannot be negative" };
     }
     if (discountPrice > regularPrice) {
       return { valid: false, error: "Discount price cannot exceed regular price" };
     }
     return { valid: true };
   }
   ```

5. **Repository** (`product.repository.js`):
   ```javascript
   async create(data) {
     const document = new this.model(data);
     return document.save();
   }
   ```

6. **Response:**
   ```json
   {
     "success": true,
     "message": "Product created successfully",
     "data": {
       "_id": "64def456...",
       "title": "Baby Onesie",
       "status": "draft",
       ...
     },
     "timestamp": "2024-01-01T00:00:00.000Z"
   }
   ```

---

## Domain Rule Example

### Pricing Rules (`rules/pricing.rules.js`)

```javascript
/**
 * Pure business logic - no dependencies
 */

// Calculate discount percentage
function calculateDiscountPercentage(regularPrice, discountPrice) {
  if (!regularPrice || regularPrice <= 0) return 0;
  if (!discountPrice || discountPrice >= regularPrice) return 0;
  return Math.round(((regularPrice - discountPrice) / regularPrice) * 100);
}

// Calculate final price
function calculateFinalPrice(regularPrice, discountPrice) {
  return discountPrice && discountPrice > 0 ? discountPrice : regularPrice;
}

// Validate pricing
function validatePricing(regularPrice, discountPrice) {
  if (regularPrice < 0) {
    return { valid: false, error: "Regular price cannot be negative" };
  }
  if (discountPrice < 0) {
    return { valid: false, error: "Discount price cannot be negative" };
  }
  if (discountPrice > regularPrice) {
    return { valid: false, error: "Discount price cannot exceed regular price" };
  }
  return { valid: true };
}

// Usage in service
const { validatePricing } = require("./rules/pricing.rules");

async createProduct(productData) {
  const validation = validatePricing(price, discountPrice);
  if (!validation.valid) {
    throw ApiError.validation(validation.error);
  }
  // ... continue
}
```

---

## Response Format Examples

### Success Response (Single Item)
```json
{
  "success": true,
  "message": "Product fetched successfully",
  "data": {
    "_id": "64abc123",
    "title": "Baby Onesie",
    "price": 599
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Success Response (List with Pagination)
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": [
    { "_id": "64abc123", "title": "Product 1" },
    { "_id": "64abc124", "title": "Product 2" }
  ],
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

### Error Response (Validation)
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
    },
    {
      "field": "price",
      "message": "Price must be a positive number",
      "value": -10
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response (Not Found)
```json
{
  "success": false,
  "message": "Product not found",
  "statusCode": 404,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Validation Schema Example

### Product Validation (`product.validation.js`)

```javascript
const { body, param, query } = require("express-validator");

const productValidation = {
  create: [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ min: 3, max: 200 })
      .withMessage("Title must be between 3 and 200 characters"),
    body("category")
      .notEmpty()
      .withMessage("Category is required")
      .isMongoId()
      .withMessage("Invalid category ID"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid status"),
  ],
  
  update: [
    param("id")
      .isMongoId()
      .withMessage("Invalid product ID"),
    body("title")
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 }),
  ],
  
  list: [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
};

module.exports = productValidation;
```

---

## Admin vs Storefront Difference

### Same Service, Different Controllers

**Storefront Controller:**
```javascript
// product.controller.js
getAllProducts = asyncHandler(async (req, res) => {
  // Only published products
  const result = await productService.getAllProducts(req.query, { isAdmin: false });
  
  res.status(200).json(
    ApiResponse.paginated("Products fetched", result.data, result.pagination).toJSON()
  );
});

getProductById = asyncHandler(async (req, res) => {
  // Throws error if product is draft
  const product = await productService.getProductById(req.params.id, { isAdmin: false });
  
  res.status(200).json(
    ApiResponse.success("Product fetched", product).toJSON()
  );
});
```

**Admin Controller:**
```javascript
// product.admin.controller.js
getAllProducts = asyncHandler(async (req, res) => {
  // All products including drafts
  const result = await productService.getAllProducts(req.query, { isAdmin: true });
  
  res.status(200).json(
    ApiResponse.paginated("Products fetched", result.data, result.pagination).toJSON()
  );
});

getProductById = asyncHandler(async (req, res) => {
  // Can access drafts
  const product = await productService.getProductById(req.params.id, { isAdmin: true });
  
  res.status(200).json(
    ApiResponse.success("Product fetched", product).toJSON()
  );
});

createProduct = asyncHandler(async (req, res) => {
  // Admin-only operation
  const product = await productService.createProduct(req.body);
  
  res.status(201).json(
    ApiResponse.success("Product created", product).toJSON()
  );
});

updateProductStatus = asyncHandler(async (req, res) => {
  // Admin-only operation
  const { id } = req.params;
  const { status } = req.body;
  const product = await productService.updateProductStatus(id, status);
  
  res.status(200).json(
    ApiResponse.success("Status updated", product).toJSON()
  );
});
```

**Service (Shared):**
```javascript
// product.service.js
async getAllProducts(filters, options = {}) {
  const filter = {};
  
  // Key difference: isAdmin flag
  if (!options.isAdmin) {
    filter.status = "published"; // Storefront only
  } else if (filters.status) {
    filter.status = filters.status; // Admin can filter
  }
  
  return productRepository.findAll(filter, options);
}

async getProductById(productId, options = {}) {
  const product = await productRepository.findById(productId);
  
  if (!product) {
    throw ApiError.notFound("Product not found");
  }
  
  // Key difference: isAdmin flag
  if (!options.isAdmin && product.status !== "published") {
    throw ApiError.notFound("Product not found");
  }
  
  return product;
}
```

---

## Error Handling Example

### Automatic Error Handling

**Controller with asyncHandler:**
```javascript
getProductById = asyncHandler(async (req, res) => {
  // If service throws ApiError, it's automatically caught
  const product = await productService.getProductById(req.params.id);
  
  res.status(200).json(
    ApiResponse.success("Product fetched", product).toJSON()
  );
});
```

**Service throws error:**
```javascript
async getProductById(productId) {
  const product = await productRepository.findById(productId);
  
  if (!product) {
    throw ApiError.notFound("Product not found"); // Automatically handled
  }
  
  return product;
}
```

**Error Middleware handles it:**
```javascript
// errorMiddleware.js automatically catches and formats:
{
  "success": false,
  "message": "Product not found",
  "statusCode": 404,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Manual Error Handling (if needed)

```javascript
try {
  const product = await productService.createProduct(data);
  res.json(ApiResponse.success("Created", product).toJSON());
} catch (error) {
  // Error middleware will handle ApiError automatically
  // But you can also handle specific cases:
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json(error.toJSON());
  }
  throw error; // Let errorMiddleware handle unknown errors
}
```

---

## 🎯 Key Principles Demonstrated

1. **Controllers are thin** - Only HTTP concerns
2. **Services contain logic** - Reusable by admin and storefront
3. **Repositories abstract DB** - Easy to swap databases
4. **Rules are pure** - Testable without mocks
5. **Responses are standardized** - Consistent API
6. **Errors are handled centrally** - No try-catch in every controller

---

These examples show the complete flow from HTTP request to database and back, demonstrating the clean separation of concerns in the new architecture.

