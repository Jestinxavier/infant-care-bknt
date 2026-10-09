require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");
(async () => {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
  const pages = await conn.db.collection("cmsPages").find({ slug: { $in: ["privacy-policy","shipping-policy","returns-and-refunds","terms-and-conditions","faqs"] } }).toArray();
  for (const p of pages) {
    const blk = (p.published?.blocks||[]).map(b=>b.type+":"+((b.data?.body||"").length));
    console.log(`${p.slug.padEnd(22)} v${p.version} ${(p.published?.blocks||[]).length}blk [${blk.join(", ")}]`);
  }
  process.exit(0);
})().catch(e=>{console.error("ERR", e.message); process.exit(1);});
