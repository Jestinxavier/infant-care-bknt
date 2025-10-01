const app = require("./app");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Force load .env from project root
const envFile = process.env.NODE_ENV === "production" 
  ? "production.env" 
  : "development.env";

dotenv.config({ path: path.resolve(__dirname, `./config/${envFile}`) });

const PORT = process.env.PORT || 3000;

// Debugging line
console.log("Loaded MONGO_URI:", process.env.MONGO_URI);

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is missing. Check your .env file!");
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
