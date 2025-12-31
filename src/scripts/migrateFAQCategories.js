const mongoose = require("mongoose");
const dotenv = require("dotenv");
const FAQ = require("../models/FAQ");
const FAQCategory = require("../models/FAQCategory");

const path = require("path");
dotenv.config({ path: path.join(__dirname, "../../.env") });

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const migrateFAQs = async () => {
  await connectDB();

  try {
    console.log("Starting migration...");

    // 1. Get all FAQs
    // We need to use lean() or bypass strict mode because the schema might have already changed in memory
    // but the data in DB is still string. Actually, Mongoose might cast error if we query now with new schema.
    // So ideally we should define a temporary schema or use `mongoose.connection.db.collection('faqs')`.

    // Safer approach: use native driver to read old data
    const faqsCollection = mongoose.connection.collection("faqs");
    const allFaqs = await faqsCollection.find({}).toArray();

    if (allFaqs.length === 0) {
      console.log("No FAQs to migrate.");
      process.exit();
    }

    console.log(`Found ${allFaqs.length} FAQs.`);

    // 2. Identify unique string categories
    const categoriesSet = new Set();
    allFaqs.forEach((faq) => {
      if (typeof faq.category === "string") {
        categoriesSet.add(faq.category);
      }
    });

    // 3. Create FAQCategory documents
    const categoryMap = {};
    let order = 0;

    for (const catName of categoriesSet) {
      let category = await FAQCategory.findOne({ name: catName });
      if (!category) {
        category = await FAQCategory.create({
          name: catName,
          displayOrder: order++,
          isActive: true,
        });
        console.log(`Created category: ${catName}`);
      }
      categoryMap[catName] = category._id;
    }

    // Default category 'General' if needed
    let generalCat = await FAQCategory.findOne({ name: "General" });
    if (!generalCat) {
      generalCat = await FAQCategory.create({
        name: "General",
        displayOrder: order++,
        isActive: true,
      });
      categoryMap["General"] = generalCat._id;
    }

    // 4. Update FAQs with ObjectId
    for (const faq of allFaqs) {
      if (typeof faq.category === "string") {
        const newCatId = categoryMap[faq.category] || categoryMap["General"];
        await faqsCollection.updateOne(
          { _id: faq._id },
          { $set: { category: newCatId } }
        );
        console.log(`Updated FAQ: ${faq.question} -> ${newCatId}`);
      }
    }

    console.log("Migration completed successfully.");
    process.exit();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrateFAQs();
