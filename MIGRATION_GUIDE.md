# Migration Guide: MVC to Feature-Based Architecture

## 🎯 Migration Overview

This guide helps you migrate from the current MVC structure to the new feature-based modular architecture.

---

## 📋 Pre-Migration Checklist

- [ ] Backup your current codebase
- [ ] Ensure all tests pass
- [ ] Document current API endpoints
- [ ] List all dependencies

---

## 🔄 Step-by-Step Migration

### Step 1: Set Up Core Infrastructure

**Create core files:**
1. `src/core/ApiResponse.js` ✅
2. `src/core/ApiError.js` ✅
3. `src/core/BaseRepository.js` ✅
4. `src/core/middleware/errorMiddleware.js` ✅
5. `src/core/middleware/asyncHandler.js` ✅
6. `src/core/middleware/validator.js` ✅

**Update `app.js`:**
```javascript
// Add error middleware at the end
const errorMiddleware = require("./core/middleware/errorMiddleware");
app.use(errorMiddleware);
```

---

### Step 2: Migrate One Feature (Product Example)

**Follow this order for each file:**

1. **Create Model** (`features/product/product.model.js`)
   - Copy from `models/Product.js`
   - Keep schema exactly the same

2. **Create Repository** (`features/product/product.repository.js`)
   - Extend BaseRepository
   - Move all database queries from controller
   - Example:
   ```javascript
   // OLD: In controller
   const products = await Product.find({ status: "published" });
   
   // NEW: In repository
   async findByStatus(status, options) {
     return this.findAll({ status }, options);
   }
   ```

3. **Create Domain Rules** (`features/product/rules/`)
   - Extract pure business logic
   - No Express, MongoDB dependencies
   - Example: pricing calculations, inventory checks

4. **Create Service** (`features/product/product.service.js`)
   - Move ALL business logic from controller
   - Use repository for data access
   - Use domain rules for calculations
   - Example:
   ```javascript
   // OLD: In controller
   const products = await Product.find({ status: "published" });
   const filtered = products.filter(p => p.price > minPrice);
   
   // NEW: In service
   async getAllProducts(filters, options) {
     const filter = { status: "published" };
     if (filters.minPrice) {
       filter["variants.price"] = { $gte: filters.minPrice };
     }
     return productRepository.findAll(filter, options);
   }
   ```

5. **Create Validation** (`features/product/product.validation.js`)
   - Move validation from controller
   - Use express-validator

6. **Create Storefront Controller** (`features/product/product.controller.js`)
   - Only HTTP handling
   - Call service
   - Format response with ApiResponse
   - Example:
   ```javascript
   // OLD
   const products = await Product.find({});
   res.json({ success: true, data: products });
   
   // NEW
   const result = await productService.getAllProducts(req.query, { isAdmin: false });
   res.status(200).json(ApiResponse.success("Products fetched", result.data).toJSON());
   ```

7. **Create Admin Controller** (`features/product/product.admin.controller.js`)
   - Similar to storefront but with `{ isAdmin: true }`
   - Additional admin-only operations

8. **Create Routes** (`features/product/product.routes.js`)
   - Define endpoints
   - Apply validation middleware
   - Map to controller methods

9. **Create Admin Routes** (`features/product/product.admin.routes.js`)
   - Apply auth + admin middleware
   - Map to admin controller

---

### Step 3: Update App.js

**Old way:**
```javascript
const productRoutes = require("./routes/product");
app.use("/api/v1/product", productRoutes);
```

**New way:**
```javascript
// Storefront routes
const productRoutes = require("./features/product/product.routes");
app.use("/api/v1/product", productRoutes);

// Admin routes
const productAdminRoutes = require("./features/product/product.admin.routes");
const ADMIN_PREFIX = process.env.ADMIN_API_PREFIX || "/admin";
app.use(`/api/v1${ADMIN_PREFIX}/products`, productAdminRoutes);
```

---

### Step 4: Migrate Remaining Features

**Priority order:**
1. ✅ Product (example done)
2. Category
3. Variant
4. Cart
5. Order
6. Payment
7. User/Auth
8. Address
9. Review
10. CMS (already isolated)

**For each feature, follow Step 2 pattern.**

---

### Step 5: Update Error Handling

**Old way:**
```javascript
try {
  // code
} catch (err) {
  res.status(500).json({ error: err.message });
}
```

**New way:**
```javascript
// Use asyncHandler wrapper
const asyncHandler = require("../../core/middleware/asyncHandler");

getProduct = asyncHandler(async (req, res) => {
  // Errors automatically caught and sent to errorMiddleware
  const product = await productService.getProductById(id);
  res.json(ApiResponse.success("Product fetched", product).toJSON());
});
```

---

### Step 6: Update Response Format

**Old way:**
```javascript
res.json({
  success: true,
  message: "Success",
  data: products
});
```

**New way:**
```javascript
res.status(200).json(
  ApiResponse.success("Products fetched successfully", products).toJSON()
);
```

---

### Step 7: Testing

**For each migrated feature:**
1. Test all storefront endpoints
2. Test all admin endpoints
3. Verify error handling
4. Check response format
5. Validate business logic

---

### Step 8: Cleanup

**After all features migrated:**
1. Delete old `controllers/` folder
2. Delete old `routes/` folder
3. Keep `models/` temporarily (for reference)
4. Update all imports
5. Remove unused dependencies

---

## 🔍 Code Comparison Examples

### Before (MVC - Controller with Business Logic)

```javascript
// controllers/product/getProducts.js
const Product = require("../../models/Product");

const getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, status = "published" } = req.query;
    
    // Business logic in controller ❌
    const filter = { status };
    if (category) filter.category = category;
    
    const skip = (page - 1) * limit;
    const products = await Product.find(filter)
      .skip(skip)
      .limit(limit)
      .populate("category");
    
    const total = await Product.countDocuments(filter);
    
    res.json({
      success: true,
      data: products,
      pagination: { page, limit, total }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
```

### After (Feature-Based - Separated Concerns)

```javascript
// features/product/product.repository.js
class ProductRepository extends BaseRepository {
  async findByStatus(status, options) {
    return this.findAll({ status }, options);
  }
}

// features/product/product.service.js
class ProductService {
  async getAllProducts(filters, options = {}) {
    const filter = {};
    if (!options.isAdmin) {
      filter.status = "published";
    } else if (filters.status) {
      filter.status = filters.status;
    }
    if (filters.category) {
      filter.category = filters.category;
    }
    return productRepository.findAll(filter, {
      page: filters.page,
      limit: filters.limit,
      populate: [{ path: "category" }]
    });
  }
}

// features/product/product.controller.js
getAllProducts = asyncHandler(async (req, res) => {
  const result = await productService.getAllProducts(req.query, { isAdmin: false });
  res.status(200).json(
    ApiResponse.paginated("Products fetched", result.data, result.pagination).toJSON()
  );
});
```

---

## ⚠️ Common Pitfalls

1. **Don't put business logic in controllers**
   - ❌ Bad: `if (price > 100) { ... }` in controller
   - ✅ Good: Move to service or domain rule

2. **Don't put database queries in services**
   - ❌ Bad: `await Product.find()` in service
   - ✅ Good: `await productRepository.findAll()`

3. **Don't mix Express with domain rules**
   - ❌ Bad: `req` or `res` in rules
   - ✅ Good: Pure functions only

4. **Don't duplicate code between admin and storefront**
   - ❌ Bad: Copy service logic
   - ✅ Good: Use same service with `isAdmin` flag

---

## 📊 Migration Progress Tracker

- [x] Core infrastructure
- [x] Product feature (example)
- [ ] Category feature
- [ ] Variant feature
- [ ] Cart feature
- [ ] Order feature
- [ ] Payment feature
- [ ] User/Auth feature
- [ ] Address feature
- [ ] Review feature
- [x] CMS feature (already isolated)

---

## 🎓 Learning Resources

- Study the Product feature example (complete implementation)
- Review BaseRepository for common patterns
- Check domain rules for pure function examples
- See ApiResponse/ApiError for response standards

---

## 🚀 Next Steps After Migration

1. Add TypeScript (optional)
2. Add unit tests for services and rules
3. Add integration tests for controllers
4. Implement caching (Redis)
5. Add queues for background jobs
6. Set up event emitters
7. Add rate limiting
8. Implement webhook handlers

---

This migration will transform your codebase into a scalable, maintainable, enterprise-ready architecture.
