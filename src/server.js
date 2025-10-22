const app = require("./app");

const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
const path = require("path");

// Import Vercel's database pooling (only available in Vercel environment)
let attachDatabasePool;
try {
  const vercelFunctions = require("@vercel/functions");
  attachDatabasePool = vercelFunctions.attachDatabasePool;
} catch (err) {
  // Not in Vercel environment or package not available
  attachDatabasePool = null;
}

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = process.env.PORT || 3000;

// Debugging line
console.log("Environment:", process.env.NODE_ENV);
console.log("onlineshopping_MONGODB_URI exists:", !!process.env.onlineshopping_MONGODB_URI);

if (!process.env.onlineshopping_MONGODB_URI) {
  console.error("❌ onlineshopping_MONGODB_URI is missing. Check your .env file or Vercel environment variables!");
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
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
};

// Handle MongoDB connection for both serverless and traditional deployments
let isConnected = false;
let mongoClient = null;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  try {
    if (!process.env.onlineshopping_MONGODB_URI) {
      throw new Error('onlineshopping_MONGODB_URI is not defined');
    }

    // For Vercel: Use connection pooling
    if (process.env.VERCEL && attachDatabasePool) {
      console.log('🔄 Setting up Vercel database connection pooling...');
      
      // Create MongoClient for Vercel pooling
      mongoClient = new MongoClient(process.env.onlineshopping_MONGODB_URI, mongooseOptions);
      
      // Attach Vercel's database pool
      attachDatabasePool(mongoClient);
      
      // Connect mongoose using the same URI
      const db = await mongoose.connect(process.env.onlineshopping_MONGODB_URI, mongooseOptions);
      isConnected = db.connections[0].readyState === 1;
      console.log("✅ MongoDB Connected with Vercel pooling");
    } else {
      // For local development or non-Vercel deployments
      console.log('🔄 Setting up standard MongoDB connection...');
      const db = await mongoose.connect(process.env.onlineshopping_MONGODB_URI, mongooseOptions);
      isConnected = db.connections[0].readyState === 1;
      console.log("✅ MongoDB Connected");
    }
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
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/v1/health/status jest`);
  });
}

module.exports = app;
