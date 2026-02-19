require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const Collection = require("../src/models/Collection");
const { generateSlug } = require("../src/utils/slugGenerator");

const toNameFromSlug = (slug) =>
  String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const parseLegacyTags = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .flatMap((item) => String(item || "").split(","))
      .map((item) => generateSlug(item))
      .filter(Boolean);
  }
  return String(input)
    .split(",")
    .map((item) => generateSlug(item))
    .filter(Boolean);
};

const uniq = (values) => {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const productsColl = mongoose.connection.collection("products");
    const cursor = productsColl.find(
      {},
      {
        projection: {
          _id: 1,
          tags: 1,
          collections: 1,
          badgeCollection: 1,
        },
      }
    );

    let migrated = 0;
    let createdCollections = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const existingCollections = Array.isArray(doc.collections)
        ? doc.collections.map((value) => generateSlug(value)).filter(Boolean)
        : [];
      const legacySlugs = parseLegacyTags(doc.tags);
      const mergedCollections = uniq([...existingCollections, ...legacySlugs]);

      for (const slug of mergedCollections) {
        const existing = await Collection.findOne({ slug }).lean();
        if (!existing) {
          await Collection.create({
            name: toNameFromSlug(slug),
            slug,
            badgeLabel: null,
            badgeColor: null,
          });
          createdCollections += 1;
        }
      }

      const existingBadge = doc.badgeCollection
        ? generateSlug(doc.badgeCollection)
        : null;
      const finalBadge =
        existingBadge && mergedCollections.includes(existingBadge)
          ? existingBadge
          : null;

      await productsColl.updateOne(
        { _id: doc._id },
        {
          $set: {
            collections: mergedCollections,
            badgeCollection: finalBadge,
          },
          $unset: {
            tags: "",
            tag: "",
          },
        }
      );

      migrated += 1;
    }

    console.log(
      `Migration complete. Products updated: ${migrated}. Collections auto-created: ${createdCollections}.`
    );
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

run();
