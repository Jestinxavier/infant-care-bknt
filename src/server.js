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
    return Promise.resolve();
  }

  try {
    if (!process.env.onlineshopping_MONGODB_URI) {
      const error = new Error('onlineshopping_MONGODB_URI is not defined');
      console.error('❌', error.message);
      throw error;
    }

    console.log('🔍 Attempting to connect to MongoDB...');
    console.log('🔍 URI preview:', process.env.onlineshopping_MONGODB_URI.substring(0, 50) + '...');

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
      console.log('📊 Connection state:', db.connections[0].readyState);
      console.log('🏛️ Database:', db.connections[0].name);
    } else {
      // For local development or non-Vercel deployments
      console.log('🔄 Setting up standard MongoDB connection...');
      const db = await mongoose.connect(process.env.onlineshopping_MONGODB_URI, mongooseOptions);
      isConnected = db.connections[0].readyState === 1;
      console.log("✅ MongoDB Connected");
      console.log('📊 Connection state:', db.connections[0].readyState);
      console.log('🏛️ Database:', db.connections[0].name);
    }
    return Promise.resolve();
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error('🐞 Full error:', err);
    isConnected = false;
    // Don't throw in production serverless - let the app continue
    if (process.env.NODE_ENV !== 'production') {
      throw err;
    }
    return Promise.reject(err);
  }
};

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    console.log('✅ Database connection established');
    
    // For serverless (Vercel), just export the app
    if (process.env.VERCEL) {
      console.log('🔧 Running in Vercel serverless mode');
    } else {
      // For traditional deployment, start the server
      app.listen(PORT, () => {
        console.log(`\n🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
        console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs/`);
        console.log(`🏥 Health Check: http://localhost:${PORT}/api/v1/health/status`);
        console.log('\n✨ Server is ready to accept requests!\n');
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Start the server
startServer();

module.exports = app;
