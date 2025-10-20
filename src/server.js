const app = require("./app");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT || 3000;

// Debugging line
console.log("Environment:", process.env.NODE_ENV);
console.log("MONGO_URI exists:", !!process.env.MONGO_URI);

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is missing. Check your .env file or Vercel environment variables!");
  // Don't exit in serverless - just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
}

// MongoDB connection options for serverless
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
};

// Handle MongoDB connection for both serverless and traditional deployments
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined');
    }

    const db = await mongoose.connect(process.env.MONGO_URI, mongooseOptions);
    isConnected = db.connections[0].readyState === 1;
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    isConnected = false;
    // Don't throw in production serverless - let the app continue
    if (process.env.NODE_ENV !== 'production') {
      throw err;
    }
  }
};

// Connect to MongoDB
connectDB();

// For serverless (Vercel), export the app
if (process.env.VERCEL) {
  module.exports = app;
} else {
  // For traditional deployment, start the server
  app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs/`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/v1/health/status`);
  });
}

module.exports = app;
