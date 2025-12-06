# New Feature-Based Modular Architecture

## 🎯 Overview

This backend has been restructured into a **feature-based modular architecture** that provides:

- ✅ **Modularity**: Each feature is self-contained
- ✅ **Scalability**: Easy to add new features
- ✅ **Testability**: Services and rules are easily testable
- ✅ **Maintainability**: Clear separation of concerns
- ✅ **Reusability**: Services shared between storefront and admin
- ✅ **Enterprise-Ready**: Follows industry best practices

---

## 📚 Documentation

- **ARCHITECTURE.md**: Complete architecture overview
- **ARCHITECTURE_NEW.md**: Detailed new architecture guide
- **ARCHITECTURE_EXAMPLES.md**: Complete code examples
- **MIGRATION_GUIDE.md**: Step-by-step migration instructions

---

## 🚀 Quick Start

### 1. Core Infrastructure (Already Created)

The core infrastructure is in place:
- `src/core/ApiResponse.js` - Unified responses
- `src/core/ApiError.js` - Custom errors
- `src/core/BaseRepository.js` - Base repository
- `src/core/middleware/errorMiddleware.js` - Error handling
- `src/core/middleware/asyncHandler.js` - Async wrapper
- `src/core/middleware/validator.js` - Validation

### 2. Example Feature (Product)

A complete Product feature example is available:
- `src/features/product/` - Full implementation

### 3. Start Migration

Follow `MIGRATION_GUIDE.md` to migrate features one by one.

---

## 📖 Key Concepts

### Feature Module Structure

Each feature follows this structure:
```
feature-name/
├── feature-name.model.js          # Schema
├── feature-name.repository.js     # DB operations
├── feature-name.service.js        # Business logic
├── feature-name.controller.js     # Storefront HTTP
├── feature-name.admin.controller.js # Admin HTTP
├── feature-name.routes.js         # Storefront routes
├── feature-name.admin.routes.js   # Admin routes
├── feature-name.validation.js     # Validation
└── rules/                         # Domain rules
    └── *.rules.js
```

### Service Reusability

Services are designed to be reused:

```javascript
// Service
async getAllProducts(filters, options = {}) {
  if (!options.isAdmin) {
    filter.status = "published"; // Storefront only
  }
  // ... logic
}

// Storefront Controller
const result = await productService.getAllProducts(req.query, { isAdmin: false });

// Admin Controller
const result = await productService.getAllProducts(req.query, { isAdmin: true });
```

### Domain Rules

Pure business logic functions:

```javascript
// rules/pricing.rules.js
function validatePricing(regularPrice, discountPrice) {
  // Pure function - no dependencies
  if (regularPrice < 0) {
    return { valid: false, error: "Price cannot be negative" };
  }
  return { valid: true };
}
```

---

## 🔄 Migration Status

- [x] Core infrastructure
- [x] Product feature (complete example)
- [x] CMS feature (isolated)
- [ ] Category feature
- [ ] Variant feature
- [ ] Cart feature
- [ ] Order feature
- [ ] Payment feature
- [ ] User/Auth feature
- [ ] Address feature
- [ ] Review feature

---

## 📝 Next Steps

1. Review the Product feature example
2. Follow the migration guide
3. Migrate features one by one
4. Test thoroughly after each migration
5. Remove old code after migration complete

---

For detailed information, see the documentation files listed above.

