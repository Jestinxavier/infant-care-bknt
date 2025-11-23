# 🌱 Seed Infant Clothing Products

## Overview

This guide explains how to seed your database with infant clothing products using the new unified product structure.

## Quick Start

```bash
cd backend
node src/scripts/seedInfantClothingProducts.js
```

## What Gets Created

The seed script creates sample infant clothing products including:

1. **Organic Cotton Infant Jumpsuit**

   - 3 colors (Red, Sky Blue, Mint Green)
   - 4 sizes (0-3, 3-6, 6-9, 9-12 months)
   - 10 variants total
   - Complete details structure

2. **Soft Cotton Bodysuit Set**
   - 3 colors (White, Pink, Blue)
   - 3 sizes (Newborn, 0-3, 3-6 months)
   - 2 variants
   - Product details

## Product Structure

Each product includes:

- ✅ `url_key` for URL-based lookups
- ✅ `variantOptions` with colors and sizes
- ✅ `variants[]` with attributes, pricing, and stock
- ✅ `details[]` with product information
- ✅ Product-level images
- ✅ Variant-level images

## Before Running

1. **Ensure MongoDB is connected:**

   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
   ```

2. **Ensure categories exist:**

   - The script will auto-create categories if they don't exist
   - Categories: `jumpsuits`, `bodysuits`, etc.

3. **Backup existing data** (if needed):
   ```bash
   mongodump --uri="your-connection-string" --out=./backup
   ```

## Running the Seed

```bash
# Navigate to backend directory
cd backend

# Run the seed script
node src/scripts/seedInfantClothingProducts.js
```

## Expected Output

```
✅ Connected to MongoDB
✅ Created product: Organic Cotton Infant Jumpsuit (10 variants)
  ✓ Created category: Jumpsuits
✅ Created product: Soft Cotton Bodysuit Set (2 variants)
  ✓ Created category: Bodysuits

📊 Seeding Summary:
  ✅ Created: 2
  ⏭️  Skipped: 0
  ❌ Errors: 0

✅ Seeding completed!
✅ Database connection closed
```

## Adding More Products

Edit `backend/src/scripts/seedInfantClothingProducts.js` and add more products to the `infantProducts` array following the same structure.

## Verifying Products

### Via API:

```bash
# Get product by url_key
curl http://localhost:3000/api/v1/product/url/infant-organic-cotton-jumpsuit

# Get category listing
curl http://localhost:3000/api/v1/variants/jumpsuits?page=1&limit=20
```

### Via MongoDB:

```javascript
use your-database-name
db.products.find({ url_key: "infant-organic-cotton-jumpsuit" })
```

## Notes

- Products are created with `status: "published"` by default
- Rating fields (`averageRating`, `totalReviews`) are set to 0 and will be calculated from reviews
- The script skips products that already exist (based on `url_key`)
- Categories are auto-created if they don't exist
