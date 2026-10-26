/**
 * One-off migration — strip the storefront domain from CMS link fields.
 *
 * Admins have saved full site URLs (e.g. "https://infantscare.in/category/rompers")
 * into header/footer link fields that expect a bare path ("/category/rompers").
 * The storefront's <Link> treats any href starting with "http" as an EXTERNAL
 * link (opens a new tab), so these self-referencing URLs break client-side nav.
 *
 * This script walks the `headerData` and `footerData` documents, and for every
 * string value that is an absolute http(s) URL on one of OUR OWN domains, rewrites
 * it to just its path (+ query + hash). Genuinely external links (facebook.com,
 * instagram.com, fonts, etc.) and media URLs are left untouched.
 *
 * DRY RUN BY DEFAULT. Pass --write to apply.
 *
 * Usage:
 *   node scripts/strip-cms-link-domains.js                     # dry run
 *   node scripts/strip-cms-link-domains.js --write             # apply
 *   node scripts/strip-cms-link-domains.js --collection headerData
 *   node scripts/strip-cms-link-domains.js --domain infantscare.in --domain www.infantscare.in
 *   node scripts/strip-cms-link-domains.js --uri <url>
 *
 * Own domains default to: the FRONTEND_URL host (if set) plus
 * infantscare.in / www.infantscare.in and their env-derived variants.
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const flagIndex = (name) => process.argv.indexOf(name);
const flagValue = (name) => {
  const i = flagIndex(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const flagValues = (name) => {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
};

const WRITE = process.argv.includes("--write");
const MONGO_URI_OVERRIDE = flagValue("--uri");
const ONLY_COLLECTION = flagValue("--collection");
const EXTRA_DOMAINS = flagValues("--domain");

const DEFAULT_DOMAINS = ["infantscare.in", "www.infantscare.in"];

function buildOwnDomains() {
  const hosts = new Set(DEFAULT_DOMAINS);

  const addFromUrl = (raw) => {
    if (!raw) return;
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (!value) return;
    try {
      const host = new URL(
        value.includes("://") ? value : `https://${value}`,
      ).hostname.toLowerCase();
      if (!host) return;
      hosts.add(host);
      hosts.add(host.startsWith("www.") ? host.slice(4) : `www.${host}`);
    } catch {
      // ignore malformed
    }
  };

  addFromUrl(process.env.FRONTEND_URL);
  addFromUrl(process.env.FRONTEND_URL_WWW);
  addFromUrl(process.env.STOREFRONT_URL);
  EXTRA_DOMAINS.forEach(addFromUrl);

  return hosts;
}

const OWN_DOMAINS = buildOwnDomains();

/**
 * If `value` is an absolute http(s) URL on one of our own domains, return the
 * path (+ query + hash). Otherwise return null (meaning "no change").
 */
function toPath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!OWN_DOMAINS.has(parsed.hostname.toLowerCase())) return null;

  const p = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return p === "" ? "/" : p;
}

// Asset references (uploaded images) must never be rewritten, even when hosted
// on our own domain.
const MEDIA_RE = /\.(png|jpe?g|webp|svg|gif|avif)(\?|#|$)/i;

/**
 * In-place rewrite: walk the object/array tree and replace every string that is
 * an absolute URL on one of our own domains with its path. Media URLs on our own
 * domain (images uploaded to the media server) are skipped so we never touch
 * asset references.
 */
function rewriteInPlace(node, jsonPath, changes) {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => rewriteInPlace(node, `${jsonPath}[${i}]`, changes));
    return;
  }
  if (typeof node !== "object") return;

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "string") {
          const next = toPath(v);
          if (next !== null && !MEDIA_RE.test(v)) {
            changes.push({ path: `${jsonPath}.${key}[${i}]`, from: v, to: next });
            value[i] = next;
          }
        } else {
          rewriteInPlace(v, `${jsonPath}.${key}[${i}]`, changes);
        }
      });
    } else if (typeof value === "string") {
      const next = toPath(value);
      if (next !== null && !MEDIA_RE.test(value)) {
        changes.push({ path: `${jsonPath}.${key}`, from: value, to: next });
        node[key] = next;
      }
    } else if (value && typeof value === "object") {
      rewriteInPlace(value, `${jsonPath}.${key}`, changes);
    }
  }
}

async function main() {
  const mongoUri = MONGO_URI_OVERRIDE || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ No MongoDB URI. Set MONGODB_URI or pass --uri <url>.");
    process.exit(1);
  }

  console.log(
    `\n${WRITE ? "✍️  Stripping CMS link domains (WRITE mode)" : "🔎 Stripping CMS link domains (dry run — pass --write to apply)"}`,
  );
  console.log(`   Own domains: ${[...OWN_DOMAINS].join(", ")}`);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;

  const collections = ONLY_COLLECTION
    ? [ONLY_COLLECTION]
    : ["headerData", "footerData"];

  let totalChanged = 0;
  let totalDocs = 0;

  for (const collName of collections) {
    const coll = db.collection(collName);
    const docs = await coll.find({}).toArray();
    let changedDocs = 0;

    for (const doc of docs) {
      const before = JSON.stringify(doc);
      const changes = [];
      // Work on a clone so we can diff and write only if needed.
      const clone = JSON.parse(before);
      rewriteInPlace(clone, "", changes);

      if (changes.length === 0) continue;

      changedDocs++;
      totalDocs++;
      totalChanged += changes.length;

      console.log(`\n  ${collName} :: _id=${doc._id}`);
      for (const c of changes) {
        console.log(`    • ${c.path}\n        - ${c.from}\n        + ${c.to}`);
      }

      if (WRITE) {
        // Apply a targeted $set so we never overwrite unrelated fields or type
        // information (e.g. ObjectIds) elsewhere in the document.
        const $set = {};
        for (const c of changes) {
          const mongoPath = c.path.replace(/^\./, "").replace(/\[(\d+)\]/g, ".$1");
          $set[mongoPath] = c.to;
        }
        await coll.updateOne({ _id: doc._id }, { $set });
      }
    }

    if (changedDocs === 0) {
      console.log(`\n  ${collName}: no self-domain links found.`);
    } else {
      console.log(`\n  ${collName}: ${changedDocs} document(s), rewrites above.`);
    }
  }

  console.log(
    `\n${WRITE ? "✅ Applied" : "ℹ️  Would apply"}: ${totalChanged} link(s) across ${totalDocs} document(s).`,
  );
  if (!WRITE && totalChanged > 0) {
    console.log("Run again with --write to apply.");
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
