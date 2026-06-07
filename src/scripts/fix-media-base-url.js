/**
 * Replace media server base URL across all collections.
 *
 * Run this once after changing BASE_URL on the media server (e.g. localhost → production domain).
 *
 * Usage:
 *   node src/scripts/fix-media-base-url.js --from http://localhost:5003 --to https://media.infantscare.in
 *   node src/scripts/fix-media-base-url.js --from http://localhost:5003 --to https://media.infantscare.in --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const FROM = get('--from');
const TO   = get('--to');
const DRY  = args.includes('--dry-run');

if (!FROM || !TO) {
  console.error('Usage: node fix-media-base-url.js --from <old-url> --to <new-url> [--dry-run]');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const stats = { updated: 0, collections: 0 };

function log(msg) { process.stdout.write(msg + '\n'); }

// Recursively walk a value and replace all strings starting with FROM
function replaceInValue(val) {
  if (typeof val === 'string') {
    return val.startsWith(FROM) ? val.replace(FROM, TO) : val;
  }
  if (Array.isArray(val)) return val.map(replaceInValue);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = replaceInValue(v);
    return out;
  }
  return val;
}

function hasOldUrl(val) {
  if (typeof val === 'string') return val.startsWith(FROM);
  if (Array.isArray(val)) return val.some(hasOldUrl);
  if (val && typeof val === 'object') return Object.values(val).some(hasOldUrl);
  return false;
}

async function fixCollection(db, name) {
  const col = db.collection(name);

  // Find docs that contain the old URL anywhere (search the raw JSON string via regex)
  const escapedFrom = FROM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = await col.find(
    { $or: [
      { $where: `JSON.stringify(this).includes(${JSON.stringify(FROM)})` },
    ]},
  ).toArray().catch(() => []); // $where fallback may fail on some Atlas tiers

  // Fallback: fetch all docs and filter in JS (safe but slower)
  const all = await col.find({}).toArray();
  const affected = all.filter(doc => hasOldUrl(doc));

  if (affected.length === 0) {
    log(`  ${name}: no documents with old URL`);
    return;
  }

  log(`  ${name}: ${affected.length} document(s) to update`);
  stats.collections++;

  for (const doc of affected) {
    const { _id, __v, ...rest } = doc;
    const fixed = replaceInValue(rest);

    if (DRY) {
      log(`    [dry-run] would update _id ${_id}`);
      stats.updated++;
      continue;
    }

    const result = await col.updateOne({ _id }, { $set: fixed });
    if (result.modifiedCount > 0) {
      log(`    updated _id ${_id}`);
      stats.updated++;
    } else {
      log(`    ⚠️  no change for _id ${_id}`);
    }
  }
}

async function run() {
  log(`\nMedia URL replacement`);
  log(`  FROM : ${FROM}`);
  log(`  TO   : ${TO}`);
  log(`  Mode : ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  await mongoose.connect(MONGODB_URI);
  log('MongoDB connected\n');

  const db = mongoose.connection.db;

  const collections = [
    'products', 'categories', 'users', 'orders', 'carts',
    'assets', 'medias', 'headerData', 'homepage', 'about', 'footerData',
  ];

  for (const name of collections) {
    await fixCollection(db, name);
  }

  log('\n' + '─'.repeat(50));
  log(`Collections touched : ${stats.collections}`);
  log(`Documents updated   : ${stats.updated}`);
  log('─'.repeat(50) + '\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
