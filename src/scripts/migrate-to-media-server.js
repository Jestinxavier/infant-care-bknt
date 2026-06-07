/**
 * Cloudinary → Media Server migration script
 *
 * Usage:
 *   node src/scripts/migrate-to-media-server.js
 *   node src/scripts/migrate-to-media-server.js --dry-run        (preview — no writes)
 *   node src/scripts/migrate-to-media-server.js --collection products
 *
 * Required env vars (read from .env automatically):
 *   MONGODB_URI, MEDIA_SERVER_URL, MEDIA_SERVER_API_KEY
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MEDIA_SERVER_URL = process.env.MEDIA_SERVER_URL;
const MEDIA_SERVER_API_KEY = process.env.MEDIA_SERVER_API_KEY;

const IS_DRY_RUN = process.argv.includes('--dry-run');
const ONLY_COLLECTION = (() => {
  const idx = process.argv.indexOf('--collection');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const stats = { migrated: 0, skipped: 0, failed: 0, total: 0 };

function log(msg) { process.stdout.write(msg + '\n'); }

// ─── Helpers ────────────────────────────────────────────────────────────────

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('cloudinary.com');
}

async function downloadImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToMediaServer(buffer, originalName) {
  const formData = new FormData();
  formData.append(
    'image',
    new Blob([buffer], { type: 'image/jpeg' }),
    originalName || 'image.jpg',
  );

  const res = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
    method: 'POST',
    headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Upload failed (${res.status}): ${body.error || res.statusText}`);
  }

  const json = await res.json();
  if (!json.url) throw new Error(`Media server returned no URL: ${JSON.stringify(json)}`);
  return json;
}

async function migrateOneUrl(cloudinaryUrl) {
  if (!isCloudinaryUrl(cloudinaryUrl)) return null;
  const buffer = await downloadImage(cloudinaryUrl);
  const originalName = cloudinaryUrl.split('/').pop().split('?')[0] || 'image.jpg';
  return uploadToMediaServer(buffer, originalName);
}

// Safe MongoDB update with result verification
async function safeUpdate(col, filter, update, docId) {
  try {
    const result = await col.updateOne(filter, update);
    if (result.modifiedCount === 0) {
      log(`    ⚠️  updateOne matched=${result.matchedCount} modified=0 for _id ${docId}`);
    }
    return result.modifiedCount > 0;
  } catch (err) {
    log(`    ❌ DB update error: ${err.message}`);
    return false;
  }
}

// ─── Pre-flight: verify media server ────────────────────────────────────────

async function preflight() {
  log('🔍 Pre-flight check...');

  // Send an empty POST — we expect 400 "No image file provided" (auth passed)
  // If we get 401 the key is wrong. Any other error means the server is down.
  let res;
  try {
    res = await fetch(`${MEDIA_SERVER_URL}/api/media/upload`, {
      method: 'POST',
      headers: { 'x-api-key': MEDIA_SERVER_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach media server at ${MEDIA_SERVER_URL}.\n` +
      `  → Start it: cd media-server && node server.js\n` +
      `  → Original error: ${err.message}`,
    );
  }

  if (res.status === 401) {
    throw new Error(
      'Media server rejected the API key (401 Unauthorized).\n' +
      '  → The server may be running with a stale key. Restart it:\n' +
      `       kill $(lsof -ti :5003) && cd media-server && node server.js\n` +
      `  → Key in .env: ${MEDIA_SERVER_API_KEY}`,
    );
  }

  // 400 = auth passed, no file sent — that's exactly what we want
  if (res.status !== 400 && !res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Media server preflight unexpected response (${res.status}): ${body.error}`);
  }

  log(`  ✅ Media server reachable at ${MEDIA_SERVER_URL} — API key accepted\n`);
}

// ─── Per-collection handlers ─────────────────────────────────────────────────

// Migrate a top-level array of URL strings: e.g. product.images = ['https://...']
async function migrateStringArray(col, docFilter, arrayField) {
  const docs = await col.find(docFilter).toArray();
  stats.total += docs.length;
  log(`  Found ${docs.length} doc(s) with Cloudinary URLs in .${arrayField}[]`);

  for (const doc of docs) {
    const arr = doc[arrayField];
    if (!Array.isArray(arr) || arr.length === 0) { stats.skipped++; continue; }

    const newArr = arr.map(v => v); // copy
    let changed = false;

    for (let i = 0; i < newArr.length; i++) {
      if (!isCloudinaryUrl(newArr[i])) continue;
      log(`  → [${i}] ${String(newArr[i]).substring(0, 90)}`);
      if (IS_DRY_RUN) { stats.skipped++; continue; }

      try {
        const result = await migrateOneUrl(newArr[i]);
        newArr[i] = result.url;
        changed = true;
        stats.migrated++;
        log(`      ✅ ${result.url}`);
      } catch (err) {
        log(`      ❌ ${err.message}`);
        stats.failed++;
      }
    }

    if (changed) {
      const ok = await safeUpdate(
        col,
        { _id: doc._id },
        { $set: { [arrayField]: newArr } },
        doc._id,
      );
      if (ok) log(`  💾 Saved doc ${doc._id}`);
    }
  }
}

// Migrate a single string field: e.g. category.image = 'https://...'
async function migrateStringField(col, docFilter, field) {
  const docs = await col.find(docFilter).toArray();
  stats.total += docs.length;
  log(`  Found ${docs.length} doc(s) with Cloudinary URL in .${field}`);

  for (const doc of docs) {
    // Support nested dot-notation: 'a.b.c'
    const oldUrl = field.split('.').reduce((o, k) => o?.[k], doc);
    if (!isCloudinaryUrl(oldUrl)) { stats.skipped++; continue; }

    log(`  → ${String(oldUrl).substring(0, 90)}`);
    if (IS_DRY_RUN) { stats.skipped++; continue; }

    try {
      const result = await migrateOneUrl(oldUrl);
      const ok = await safeUpdate(
        col,
        { _id: doc._id },
        { $set: { [field]: result.url } },
        doc._id,
      );
      if (ok) {
        stats.migrated++;
        log(`      ✅ ${result.url}`);
      } else {
        stats.failed++;
      }
    } catch (err) {
      log(`      ❌ ${err.message}`);
      stats.failed++;
    }
  }
}

// Migrate variant images — supports BOTH formats:
//   string array  : variants[].images = ['https://res.cloudinary.com/...']  ← actual data
//   object array  : variants[].images = [{ url, public_id, ... }]           ← newer schema
async function migrateVariantImages(col) {
  // Query covers both formats
  const docs = await col.find({
    $or: [
      { 'variants.images': /cloudinary\.com/ },          // string array format
      { 'variants.images.url': /cloudinary\.com/ },      // object array format
    ],
  }).toArray();

  stats.total += docs.length;
  log(`  Found ${docs.length} product(s) with Cloudinary variant images`);

  for (const doc of docs) {
    if (!Array.isArray(doc.variants)) continue;
    let docChanged = false;

    const newVariants = [];
    for (const variant of doc.variants) {
      if (!Array.isArray(variant.images) || variant.images.length === 0) {
        newVariants.push(variant);
        continue;
      }

      const newImages = [];
      for (const img of variant.images) {
        // ── String format ──────────────────────────────────────────────
        if (typeof img === 'string') {
          if (!isCloudinaryUrl(img)) { newImages.push(img); continue; }
          log(`  → variant.images[string]: ${img.substring(0, 90)}`);
          if (IS_DRY_RUN) { stats.skipped++; newImages.push(img); continue; }
          try {
            const result = await migrateOneUrl(img);
            newImages.push(result.url);
            docChanged = true;
            stats.migrated++;
            log(`      ✅ ${result.url}`);
          } catch (err) {
            log(`      ❌ ${err.message}`);
            stats.failed++;
            newImages.push(img);
          }
          continue;
        }

        // ── Object format { url, public_id, ... } ─────────────────────
        if (img && typeof img === 'object') {
          if (!isCloudinaryUrl(img.url)) { newImages.push(img); continue; }
          log(`  → variant.images[object].url: ${String(img.url).substring(0, 90)}`);
          if (IS_DRY_RUN) { stats.skipped++; newImages.push(img); continue; }
          try {
            const result = await migrateOneUrl(img.url);
            newImages.push({
              ...img,
              url: result.url,
              public_id: result.public_id,
              width: result.width || img.width,
              height: result.height || img.height,
              format: result.format || img.format,
              size: result.size || img.size,
            });
            docChanged = true;
            stats.migrated++;
            log(`      ✅ ${result.url}`);
          } catch (err) {
            log(`      ❌ ${err.message}`);
            stats.failed++;
            newImages.push(img);
          }
          continue;
        }

        newImages.push(img);
      }

      newVariants.push({ ...variant, images: newImages });
    }

    if (docChanged) {
      const ok = await safeUpdate(col, { _id: doc._id }, { $set: { variants: newVariants } }, doc._id);
      if (ok) log(`  💾 Saved product ${doc._id}`);
    }
  }
}

// Migrate Asset collection (secureUrl + publicId fields)
async function migrateAssetCollection(col) {
  const docs = await col.find({ secureUrl: /cloudinary\.com/ }).toArray();
  stats.total += docs.length;
  log(`  Found ${docs.length} asset record(s) with Cloudinary secureUrl`);

  for (const doc of docs) {
    log(`  → ${doc.secureUrl.substring(0, 90)}`);
    if (IS_DRY_RUN) { stats.skipped++; continue; }

    try {
      const result = await migrateOneUrl(doc.secureUrl);
      const ok = await safeUpdate(
        col,
        { _id: doc._id },
        {
          $set: {
            secureUrl: result.url,
            publicId: result.public_id,
            format: 'webp',
            width: result.width || doc.width,
            height: result.height || doc.height,
            bytes: result.size || doc.bytes,
          },
        },
        doc._id,
      );
      if (ok) { stats.migrated++; log(`      ✅ ${result.url}`); }
      else stats.failed++;
    } catch (err) {
      log(`      ❌ ${err.message}`);
      stats.failed++;
    }
  }
}

// Migrate Media collection (tracks uploaded assets)
async function migrateMediaCollection(col) {
  const docs = await col.find({ url: /cloudinary\.com/ }).toArray();
  stats.total += docs.length;
  log(`  Found ${docs.length} media tracking record(s) with Cloudinary URL`);

  for (const doc of docs) {
    log(`  → ${doc.url.substring(0, 90)}`);
    if (IS_DRY_RUN) { stats.skipped++; continue; }

    try {
      const result = await migrateOneUrl(doc.url);
      const ok = await safeUpdate(
        col,
        { _id: doc._id },
        { $set: { url: result.url, public_id: result.public_id, format: 'webp', width: result.width, height: result.height, size: result.size } },
        doc._id,
      );
      if (ok) { stats.migrated++; log(`      ✅ ${result.url}`); }
      else stats.failed++;
    } catch (err) {
      log(`      ❌ ${err.message}`);
      stats.failed++;
    }
  }
}

// Migrate order item images (image, variantImage, selectedGift.image)
async function migrateOrderImages(col) {
  const docs = await col.find({
    $or: [
      { 'items.image': /cloudinary\.com/ },
      { 'items.variantImage': /cloudinary\.com/ },
      { 'items.selectedGift.image': /cloudinary\.com/ },
    ],
  }).toArray();

  stats.total += docs.length;
  log(`  Found ${docs.length} order(s) with Cloudinary image URLs`);

  for (const doc of docs) {
    if (!Array.isArray(doc.items)) continue;
    let docChanged = false;

    const newItems = [];
    for (const item of doc.items) {
      const out = { ...item };
      for (const f of ['image', 'variantImage']) {
        if (!isCloudinaryUrl(item[f])) continue;
        log(`  → order.item.${f}: ${item[f].substring(0, 90)}`);
        if (IS_DRY_RUN) { stats.skipped++; continue; }
        try {
          const result = await migrateOneUrl(item[f]);
          out[f] = result.url;
          docChanged = true;
          stats.migrated++;
          log(`      ✅ ${result.url}`);
        } catch (err) { log(`      ❌ ${err.message}`); stats.failed++; }
      }

      if (item.selectedGift?.image && isCloudinaryUrl(item.selectedGift.image)) {
        log(`  → order.item.selectedGift.image: ${item.selectedGift.image.substring(0, 90)}`);
        if (!IS_DRY_RUN) {
          try {
            const result = await migrateOneUrl(item.selectedGift.image);
            out.selectedGift = { ...item.selectedGift, image: result.url };
            docChanged = true;
            stats.migrated++;
            log(`      ✅ ${result.url}`);
          } catch (err) { log(`      ❌ ${err.message}`); stats.failed++; }
        } else stats.skipped++;
      }
      newItems.push(out);
    }

    if (docChanged) {
      const ok = await safeUpdate(col, { _id: doc._id }, { $set: { items: newItems } }, doc._id);
      if (ok) log(`  💾 Saved order ${doc._id}`);
    }
  }
}

// Recursively migrate all "url" keys in CMS content objects
async function migrateCmsDoc(obj, changed) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    const out = [];
    for (const item of obj) out.push(await migrateCmsDoc(item, changed));
    return out;
  }
  const out = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && isCloudinaryUrl(val)) {
      log(`  → .${key}: ${val.substring(0, 90)}`);
      if (IS_DRY_RUN) { stats.skipped++; out[key] = val; }
      else {
        try {
          const result = await migrateOneUrl(val);
          out[key] = result.url;
          changed.yes = true;
          stats.migrated++;
          log(`      ✅ ${result.url}`);
        } catch (err) { log(`      ❌ ${err.message}`); stats.failed++; out[key] = val; }
      }
    } else if (val && typeof val === 'object') {
      out[key] = await migrateCmsDoc(val, changed);
    } else {
      out[key] = val;
    }
  }
  return out;
}

async function migrateCmsCollection(col) {
  const docs = await col.find({}).toArray();
  log(`  Found ${docs.length} doc(s) in ${col.collectionName}`);
  stats.total += docs.length;

  for (const doc of docs) {
    const changed = { yes: false };
    const newDoc = await migrateCmsDoc(doc, changed);
    if (changed.yes) {
      const { _id, __v, ...fields } = newDoc;
      const ok = await safeUpdate(col, { _id: doc._id }, { $set: fields }, doc._id);
      if (ok) log(`  💾 Saved CMS doc ${doc._id}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  if (!MONGODB_URI) { log('❌ MONGODB_URI not set in .env'); process.exit(1); }
  if (!MEDIA_SERVER_URL) { log('❌ MEDIA_SERVER_URL not set in .env'); process.exit(1); }
  if (!MEDIA_SERVER_API_KEY) { log('❌ MEDIA_SERVER_API_KEY not set in .env'); process.exit(1); }

  log('\n🚀 Cloudinary → Media Server migration');
  log(`   Media server : ${MEDIA_SERVER_URL}`);
  log(`   Mode         : ${IS_DRY_RUN ? '🔍 DRY RUN (no writes)' : '✍️  LIVE'}`);
  if (ONLY_COLLECTION) log(`   Collection   : ${ONLY_COLLECTION} only`);
  log('');

  // Verify media server is up and accepting our key BEFORE touching MongoDB
  await preflight();

  await mongoose.connect(MONGODB_URI);
  log('✅ MongoDB connected\n');

  const db = mongoose.connection.db;

  const collections = {
    products: async () => {
      const col = db.collection('products');
      log('📦 Products — variant images (objects in variants[].images[])');
      await migrateVariantImages(col);
      log('📦 Products — legacy top-level images[] string array');
      await migrateStringArray(col, { images: /cloudinary\.com/ }, 'images');
    },
    categories: async () => {
      log('🗂️  Categories — image field');
      await migrateStringField(db.collection('categories'), { image: /cloudinary\.com/ }, 'image');
    },
    users: async () => {
      log('👤 Users — avatar field');
      await migrateStringField(db.collection('users'), { avatar: /cloudinary\.com/ }, 'avatar');
    },
    orders: async () => {
      log('📋 Orders — item images');
      await migrateOrderImages(db.collection('orders'));
    },
    carts: async () => {
      log('🛒 Carts — imageSnapshot field');
      // Use $elemMatch to find carts with matching items
      const col = db.collection('carts');
      const docs = await col.find({ 'items.imageSnapshot': /cloudinary\.com/ }).toArray();
      stats.total += docs.length;
      log(`  Found ${docs.length} cart(s)`);

      for (const doc of docs) {
        if (!Array.isArray(doc.items)) continue;
        let docChanged = false;
        const newItems = [];

        for (const item of doc.items) {
          const out = { ...item };
          if (isCloudinaryUrl(item.imageSnapshot)) {
            log(`  → cart.item.imageSnapshot: ${item.imageSnapshot.substring(0, 90)}`);
            if (!IS_DRY_RUN) {
              try {
                const result = await migrateOneUrl(item.imageSnapshot);
                out.imageSnapshot = result.url;
                docChanged = true;
                stats.migrated++;
                log(`      ✅ ${result.url}`);
              } catch (err) { log(`      ❌ ${err.message}`); stats.failed++; }
            } else stats.skipped++;
          }
          newItems.push(out);
        }

        if (docChanged) {
          const ok = await safeUpdate(col, { _id: doc._id }, { $set: { items: newItems } }, doc._id);
          if (ok) log(`  💾 Saved cart ${doc._id}`);
        }
      }
    },
    assets: async () => {
      log('📁 Assets collection (secureUrl + publicId)');
      await migrateAssetCollection(db.collection('assets'));
    },
    medias: async () => {
      log('🖼️  Media tracking collection');
      await migrateMediaCollection(db.collection('medias'));
    },
    headerData: async () => {
      log('🔝 Header CMS');
      await migrateCmsCollection(db.collection('headerData'));
    },
    homepage: async () => {
      log('🏠 Homepage CMS');
      await migrateCmsCollection(db.collection('homepage'));
    },
    about: async () => {
      log('ℹ️  About CMS');
      await migrateCmsCollection(db.collection('about'));
    },
    footerData: async () => {
      log('🦶 Footer CMS');
      await migrateCmsCollection(db.collection('footerData'));
    },
  };

  const toRun = ONLY_COLLECTION
    ? Object.fromEntries(Object.entries(collections).filter(([k]) => k === ONLY_COLLECTION))
    : collections;

  if (ONLY_COLLECTION && Object.keys(toRun).length === 0) {
    log(`❌ Unknown collection: ${ONLY_COLLECTION}`);
    log(`   Valid collections: ${Object.keys(collections).join(', ')}`);
    process.exit(1);
  }

  for (const [name, handler] of Object.entries(toRun)) {
    try {
      await handler();
    } catch (err) {
      log(`❌ Fatal error in ${name}: ${err.message}`);
    }
    log('');
  }

  log('─'.repeat(50));
  log(`✅ Migrated : ${stats.migrated}`);
  log(`⏭️  Skipped  : ${stats.skipped}`);
  log(`❌ Failed   : ${stats.failed}`);
  log(`📊 Total    : ${stats.total}`);
  log('─'.repeat(50));

  if (stats.failed > 0) log('\n⚠️  Re-run the script — failed images will be retried automatically.');

  await mongoose.disconnect();
  process.exit(stats.failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
