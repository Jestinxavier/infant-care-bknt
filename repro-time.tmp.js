const path = require("path");
const backend = process.cwd();
require(path.join(backend, "node_modules/dotenv")).config({ path: path.join(backend, ".env") });
process.env.NODE_ENV = "development";

const mongoose = require(path.join(backend, "node_modules/mongoose"));

async function callPeriod(period) {
  const controller = require(path.join(
    backend,
    "src/controllers/admin/dashboardController.js"
  ));
  const req = { query: { period } };
  return new Promise((resolve, reject) => {
    const res = {
      status() { return this; },
      json(payload) { resolve(payload); return this; },
    };
    controller.getDashboardStats(req, res).catch(reject);
  });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("connected");
  for (const p of ["month", "year", "all"]) {
    const t = Date.now();
    try {
      const data = await callPeriod(p);
      console.log(`period=${p} elapsedMs=${Date.now() - t} salesLen=${data.salesOverTime.length} orders=${data.newOrders}`);
    } catch (e) {
      console.error(`period=${p} ERROR after ${Date.now() - t}ms`, e.message);
    }
  }
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
