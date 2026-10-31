require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const CmsPage = require("../src/features/cms/pages/cmsPage.model");

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  await mongoose.connect(uri);
  const page = await CmsPage.findOne({ slug: "faqs" }).lean();
  if (!page) {
    console.log("❌ No CMS page with slug 'faqs'");
    process.exit(1);
  }
  const pub = page.published;
  const blocks = pub?.blocks || [];
  const faq = blocks.find((b) => b.type === "faqList");
  const items = faq?.data?.items || [];
  const first = items[0] || {};
  console.log("✅ /faqs CMS page  v" + page.version + "  status=" + page.status);
  console.log("   blocks      : " + blocks.map((b) => b.type).join(", "));
  console.log("   faqList     : " + items.length + " item(s)");
  console.log("   item[0] keys: " + Object.keys(first).join(", "));
  console.log("   sample      : " + JSON.stringify(first).slice(0, 160));
  await mongoose.disconnect();
  process.exit(0);
};
run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
