/**
 * Migration: Add Product SKU and URL Key Indexes
 *
 * This migration adds:
 * 1. Unique indexes for SKU and URL key fields
 * 2. New fields for SKU/URL key management
 * 3. Image metadata schema updates
 * 4. One-time data normalization
 */

const mongoose = require('mongoose');

async function up() {
  const db = mongoose.connection.db;
  const productsCollection = db.collection('products');

  console.log('Starting product schema migration...');

  try {
    // 1. Add unique indexes
    console.log('Creating unique indexes...');

    // Product-level SKU index (sparse to allow null values)
    await productsCollection.createIndex(
      { sku: 1 },
      { unique: true, sparse: true, name: 'product_sku_unique' }
    );

    // URL key index (sparse to allow null values)
    await productsCollection.createIndex(
      { url_key: 1 },
      { unique: true, sparse: true, name: 'product_url_key_unique' }
    );

    // Variant SKU index across all products (sparse)
    await productsCollection.createIndex(
      { 'variants.sku': 1 },
      { unique: true, sparse: true, name: 'variant_sku_unique' }
    );

    // Additional useful indexes
    await productsCollection.createIndex(
      { category: 1, status: 1 },
      { name: 'category_status_idx' }
    );

    await productsCollection.createIndex(
      { status: 1, createdAt: -1 },
      { name: 'status_created_idx' }
    );

    // 2. Migrate existing products to new schema
    console.log('Migrating existing products...');

    const products = await productsCollection.find({}).toArray();
    let migrationCount = 0;

    for (const product of products) {
      const updates = {};
      let needsUpdate = false;

      // Add new fields if they don't exist
      if (!product.hasOwnProperty('skuLocked')) {
        updates.skuLocked = false;
        needsUpdate = true;
      }

      if (!product.hasOwnProperty('urlKeyHistory')) {
        updates.urlKeyHistory = [];
        needsUpdate = true;
      }

      if (!product.hasOwnProperty('visibility')) {
        updates.visibility = 'public';
        needsUpdate = true;
      }

      if (!product.hasOwnProperty('currency')) {
        updates.currency = 'INR';
        needsUpdate = true;
      }

      if (!product.hasOwnProperty('taxClass')) {
        updates.taxClass = 'standard';
        needsUpdate = true;
      }

      // Migrate image URLs to metadata format
      if (product.images && Array.isArray(product.images)) {
        const migratedImages = [];
        let imagesMigrated = false;

        for (let i = 0; i < product.images.length; i++) {
          const img = product.images[i];

          // If it's already in the new format, keep it
          if (typeof img === 'object' && img.url && img.public_id) {
            migratedImages.push(img);
          } else if (typeof img === 'string') {
            // Convert URL string to metadata format
            const publicIdMatch = img.match(/\/(?:image\/upload\/)?(?:[^/]+\/)*([^/.]+)/);
            const formatMatch = img.match(/\.([a-z]+)(?:\?|$)/i);

            migratedImages.push({
              url: img,
              public_id: publicIdMatch ? publicIdMatch[1] : `legacy_${product._id}_${i}`,
              width: 600,
              height: 600,
              format: formatMatch ? formatMatch[1] : 'jpg',
              alt: ''
            });
            imagesMigrated = true;
          }
        }

        if (imagesMigrated) {
          updates.images = migratedImages;
          needsUpdate = true;
        }
      }

      // Migrate variant images to metadata format
      if (product.variants && Array.isArray(product.variants)) {
        const migratedVariants = [];
        let variantsMigrated = false;

        for (let vIndex = 0; vIndex < product.variants.length; vIndex++) {
          const variant = { ...product.variants[vIndex] };

          // Add skuLocked field to variants
          if (!variant.hasOwnProperty('skuLocked')) {
            variant.skuLocked = false;
            variantsMigrated = true;
          }

          // Migrate variant images
          if (variant.images && Array.isArray(variant.images)) {
            const migratedVariantImages = [];

            for (let iIndex = 0; iIndex < variant.images.length; iIndex++) {
              const img = variant.images[iIndex];

              if (typeof img === 'object' && img.url && img.public_id) {
                migratedVariantImages.push(img);
              } else if (typeof img === 'string') {
                const publicIdMatch = img.match(/\/(?:image\/upload\/)?(?:[^/]+\/)*([^/.]+)/);
                const formatMatch = img.match(/\.([a-z]+)(?:\?|$)/i);

                migratedVariantImages.push({
                  url: img,
                  public_id: publicIdMatch ? publicIdMatch[1] : `legacy_v${vIndex}_${iIndex}_${product._id}`,
                  width: 600,
                  height: 600,
                  format: formatMatch ? formatMatch[1] : 'jpg',
                  alt: ''
                });
                variantsMigrated = true;
              }
            }

            variant.images = migratedVariantImages;
          } else {
            variant.images = [];
          }

          migratedVariants.push(variant);
        }

        if (variantsMigrated) {
          updates.variants = migratedVariants;
          needsUpdate = true;
        }
      }

      // Generate URL key if missing
      if (!product.url_key && product.title) {
        const slug = product.title
          .toString()
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]+/g, '')
          .replace(/\-\-+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '');

        if (slug) {
          // Check if this slug already exists
          const existingSlug = await productsCollection.findOne({ url_key: slug });

          if (existingSlug) {
            updates.url_key = `${slug}-${product._id.toString().slice(-4)}`;
          } else {
            updates.url_key = slug;
          }
          needsUpdate = true;
        }
      }

      // Apply updates if needed
      if (needsUpdate) {
        await productsCollection.updateOne(
          { _id: product._id },
          { $set: updates }
        );
        migrationCount++;
      }
    }

    console.log(`Migration completed. Updated ${migrationCount} products.`);

    // 3. Validate indexes were created successfully
    console.log('Validating indexes...');
    const indexes = await productsCollection.indexes();
    const indexNames = indexes.map(idx => idx.name);

    const requiredIndexes = [
      'product_sku_unique',
      'product_url_key_unique',
      'variant_sku_unique',
      'category_status_idx',
      'status_created_idx'
    ];

    for (const indexName of requiredIndexes) {
      if (!indexNames.includes(indexName)) {
        throw new Error(`Index ${indexName} was not created successfully`);
      }
    }

    console.log('All indexes created successfully');
    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

async function down() {
  const db = mongoose.connection.db;
  const productsCollection = db.collection('products');

  console.log('Rolling back product schema migration...');

  try {
    // Remove the indexes we created
    const indexesToRemove = [
      'product_sku_unique',
      'product_url_key_unique',
      'variant_sku_unique',
      'category_status_idx',
      'status_created_idx'
    ];

    for (const indexName of indexesToRemove) {
      try {
        await productsCollection.dropIndex(indexName);
        console.log(`Dropped index: ${indexName}`);
      } catch (error) {
        if (error.code === 27) { // IndexNotFound
          console.log(`Index ${indexName} was not found, skipping...`);
        } else {
          throw error;
        }
      }
    }

    // Note: We don't remove the new fields or revert image migrations
    // as this could cause data loss. Manual cleanup would be required.
    console.log('Warning: New fields (skuLocked, urlKeyHistory, etc.) were not removed to prevent data loss');
    console.log('Rollback completed');

  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down
};

// If run directly (not imported), execute the migration
if (require.main === module) {
  const mongoose = require('mongoose');

  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/infant_care', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  mongoose.connection.on('connected', async () => {
    console.log('Connected to MongoDB');

    try {
      if (process.argv[2] === 'down') {
        await down();
      } else {
        await up();
      }

      console.log('Migration script completed');
      process.exit(0);
    } catch (error) {
      console.error('Migration script failed:', error);
      process.exit(1);
    }
  });

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
}
