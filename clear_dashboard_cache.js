const { cacheDel } = require("./src/utils/redisCache");
async function run() {
  try {
    await cacheDel("dashboard:week", "dashboard:month", "dashboard:year", "dashboard:all");
    console.log("Dashboard cache cleared.");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
