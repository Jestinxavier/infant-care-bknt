require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");
(async () => {
  const conn = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
  const slugs = ["privacy-policy","shipping-policy","return&refund-policy","terms&conditions","faqs","about-us"];
  for (const slug of slugs) {
    const p = await conn.db.collection("cmsPages").findOne({ slug });
    if (!p) { console.log(`-- ${slug}: MISSING`); continue; }
    const blk = (p.published?.blocks||[]).sort((a,b)=>(a.order??0)-(b.order??0));
    console.log(`-- ${slug} | ${p.status} v${p.version} | blocks=${blk.length}`);
  }
  process.exit(0);
})().catch(e=>{console.error("ERR",e.message);process.exit(1);});
