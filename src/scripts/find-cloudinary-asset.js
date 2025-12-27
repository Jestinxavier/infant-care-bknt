const { cloudinary } = require("../config/cloudinary");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function findAsset() {
  console.log("Searching Cloudinary...");
  try {
    // Search for resources containing the timestamp/string we saw in logs
    // Using Search API which is powerful
    const result = await cloudinary.search
      .expression(
        "resource_type:image AND filename:category_1766214100893_eps0rtr_n3qgbc*"
      )
      .max_results(10)
      .execute();

    console.log("Search Results:", JSON.stringify(result, null, 2));

    // Also try listing root resources just in case
    // const root = await cloudinary.api.resources({ type: 'upload', prefix: '', max_results: 5 });
    // console.log("Root samples:", root.resources.map(r => r.public_id));
  } catch (e) {
    console.error("Search failed:", e);
  }
}
findAsset();
