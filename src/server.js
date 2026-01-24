const app = require("./app");

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = process.env.PORT;

// Debugging line
console.log("Environment:", process.env.NODE_ENV);
console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);

if (!process.env.MONGODB_URI) {
  console.error(
    "❌ MONGODB_URI is missing. Check your .env file or Vercel environment variables!"
  );
  // Don't exit in serverless - just log the error
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
}

// MongoDB connection options optimized for Vercel serverless
const mongooseOptions = {
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxIdleTimeMS: 5000, // Close idle connections after 5s
};

// MongoDB Client options for Vercel pooling
const mongoClientOptions = {
  maxIdleTimeMS: 5000,
  maxPoolSize: 10,
  minPoolSize: 1,
};

// Handle MongoDB connection for both serverless and traditional deployments
let isConnected = false;
let mongoClient = null;

const connectDB = async (retryCount = 5) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }

  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined");
    }

    console.log(`🔍 Connecting to MongoDB (Attempt ${6 - retryCount}/5)...`);

    // For local development or non-Vercel deployments
    const db = await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    isConnected = db.connections[0].readyState === 1;
    console.log("✅ MongoDB Connected");
    return Promise.resolve();
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    if (retryCount > 1) {
      console.log(`🔄 Retrying in 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return connectDB(retryCount - 1);
    }
    isConnected = false;
    if (process.env.NODE_ENV !== "production") {
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
    console.log("✅ Database connection established");

    // Start media cleanup cron job (only in non-serverless environments)
    // Note: Cron jobs don't work well in serverless environments like Vercel
    // For serverless, use Vercel Cron Jobs or external scheduler
    if (!process.env.VERCEL) {
      try {
        const {
          startMediaCleanupCron,
        } = require("./services/mediaCleanupService");
        startMediaCleanupCron();
      } catch (cronError) {
        console.warn(
          "⚠️ Failed to start media cleanup cron:",
          cronError.message
        );
        console.warn("💡 Install node-cron: npm install node-cron");
      }

      // Start CSV temp image cleanup cron job
      try {
        const {
          startCsvImageCleanupCron,
        } = require("./services/csvImageCleanupService");
        startCsvImageCleanupCron();
      } catch (cronError) {
        console.warn(
          "⚠️ Failed to start CSV image cleanup cron:",
          cronError.message
        );
      }

      // Start expired assets cleanup cron job (temp images after 24h)
      try {
        const cleanupExpiredAssets = require("./jobs/cleanupExpiredAssets");
        cleanupExpiredAssets();
      } catch (cronError) {
        console.warn(
          "⚠️ Failed to start expired assets cleanup cron:",
          cronError.message
        );
      }
    } else {
      console.log("ℹ️ Skipping cron job setup (serverless environment)");
      console.log("💡 Use Vercel Cron Jobs or external scheduler for cleanup");
    }

    // For serverless (Vercel), just export the app
    if (process.env.VERCEL) {
      console.log("🔧 Running in Vercel serverless mode");
    } else {
      // For traditional deployment, start the server
      const http = require("http");
      const server = http.createServer(app);
      
      // Initialize Socket.io
      const socketService = require("./services/socketService");
      socketService.init(server);

      server.listen(PORT, () => {
        console.log(
          `\n🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
        );
        console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs/`);
        console.log(
          `🏥 Health Check: http://localhost:${PORT}/api/v1/health/status`
        );
        console.log(
          "\n✨ Server is ready to accept requests! (Search API Enabled)\n"
        );
      });
    }
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    if (process.env.NODE_ENV !== "production") {
      process.exit(1);
    }
  }
};

// Start the server
startServer();

module.exports = app;
