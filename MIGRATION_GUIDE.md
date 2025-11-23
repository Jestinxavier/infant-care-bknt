# 📦 Product Model Migration Guide

## Overview

The Product model has been updated with a new unified structure. MongoDB itself doesn't need manual schema changes - Mongoose handles schema validation at the application level. However, **existing products in your database need to be migrated** to populate the new fields.

## What Changed?

### New Fields Added:
- `url_key` - Unique identifier for product URLs (replaces `_id` for lookups)
- `variantOptions[]` - Array of product options (Color, Size, etc.)
- `variants[]` - Embedded variant array (moved from separate Variant collection)
- `selectedOptions` - Default selected variant options
- `details[]` - Additional product details array

### Fields Removed from Manual Input:
- `averageRating` - Now calculated from reviews (read-only)
- `totalReviews` - Now calculated from reviews (read-only)

## Step-by-Step Migration

### 1. **Backup Your Database** (Recommended)

Before running any migration, backup your MongoDB database:

```bash
# Using mongodump (if you have MongoDB tools installed)
mongodump --uri="your-mongodb-connection-string" --out=./backup-$(date +%Y%m%d)
```

Or use MongoDB Atlas backup feature if you're using Atlas.

### 2. **Ensure Environment Variables Are Set**

Make sure your `.env` file has the MongoDB connection string:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

**Note:** The migration script will use `MONGODB_URI` or `MONGO_URI` (checks both).

### 3. **Run the Migration Script**

Navigate to the backend directory and run:

```bash
cd backend
node src/scripts/migrateProductsToNewStructure.js
```

### 4. **What the Migration Does**

The script will:
1. ✅ Generate `url_key` for all products without one (from title/name)
2. ✅ Migrate legacy Variant collection data into embedded `variants[]` array
3. ✅ Extract `variantOptions` from existing variants (Color, Age/Size)
4. ✅ Set `selectedOptions` to first variant if only one exists
5. ✅ Sync `title` and `name` fields for backward compatibility
6. ✅ Set default `status` to "published" for existing products

### 5. **Expected Output**

You should see output like:

```
✅ Connected to MongoDB
📦 Found 25 products to migrate
  ✓ Generated url_key: infant-organic-cotton-jumpsuit
  ✓ Migrated 3 legacy variants to embedded structure
✅ Migrated product: Infant Organic Cotton Jumpsuit
  ⏭️  Skipped (already migrated): Another Product Name
...

📊 Migration Summary:
  ✅ Migrated: 20
  ⏭️  Skipped: 5
  ❌ Errors: 0

✅ Migration completed!
✅ Database connection closed
```

### 6. **Verify Migration**

After migration, verify the changes:

#### Option A: Check via MongoDB Compass or Atlas UI
- Open your database
- Navigate to the `products` collection
- Check a product document - it should have:
  - `url_key` field
  - `variants[]` array (if product had variants)
  - `variantOptions[]` array (if variants exist)

#### Option B: Check via API
```bash
# Get a product by url_key
curl http://localhost:3000/api/v1/product/url/infant-organic-cotton-jumpsuit

# Should return product with new structure
```

#### Option C: Check via MongoDB Shell
```javascript
// Connect to MongoDB
use your-database-name

// Check a product
db.products.findOne({ url_key: "infant-organic-cotton-jumpsuit" })

// Should show:
// - url_key: "infant-organic-cotton-jumpsuit"
// - variants: [ { id, sku, price, stock, ... } ]
// - variantOptions: [ { name, code, values: [...] } ]
```

## Troubleshooting

### Error: "MONGODB_URI is missing"
**Solution:** Check your `.env` file has `MONGODB_URI` or `MONGO_URI` set.

### Error: "Connection timeout"
**Solution:** 
- Check your MongoDB connection string is correct
- Ensure MongoDB Atlas IP whitelist includes your IP (or `0.0.0.0/0` for all)
- Check network connectivity

### Error: "Duplicate url_key"
**Solution:** The script handles this automatically by appending `-1`, `-2`, etc. If you see this error, it means there's a conflict that couldn't be resolved. Check your products manually.

### Products Not Migrating
**Solution:**
- Check if products already have `url_key` (they'll be skipped)
- Check MongoDB connection is working
- Review error messages in the migration output

## Post-Migration Checklist

- [ ] All products have `url_key` field
- [ ] Legacy variants migrated to embedded `variants[]` array
- [ ] `variantOptions` extracted correctly
- [ ] API endpoints work with new structure
- [ ] Frontend can fetch products by `url_key`
- [ ] Category listing shows variants as separate items

## Rollback (If Needed)

If you need to rollback:

1. **Restore from backup:**
   ```bash
   mongorestore --uri="your-mongodb-connection-string" ./backup-YYYYMMDD
   ```

2. **Or manually remove new fields** (not recommended):
   ```javascript
   // MongoDB shell
   db.products.updateMany(
     {},
     { $unset: { url_key: "", variants: "", variantOptions: "", selectedOptions: "", details: "" } }
   )
   ```

## Important Notes

1. **No Data Loss:** The migration is additive - it only adds new fields. Existing data remains intact.

2. **Backward Compatibility:** The code maintains backward compatibility with legacy structure during transition.

3. **Legacy Variants Collection:** The old `variants` collection is not deleted - it's kept for reference. You can delete it later after verifying everything works.

4. **Indexes:** MongoDB will automatically create indexes for `url_key` when documents are saved.

5. **Rating Fields:** `averageRating` and `totalReviews` are now read-only and calculated from reviews. They cannot be manually set.

## Next Steps

After successful migration:

1. Test product creation via dashboard
2. Test product fetching by `url_key`
3. Test category listing with filters
4. Monitor for any issues
5. Consider deleting legacy `variants` collection after verification (optional)

---

**Need Help?** Check the migration script logs for detailed error messages.

