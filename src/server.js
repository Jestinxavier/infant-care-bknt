const app = require("./app");

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const logger = require("./utils/logger");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = process.env.PORT;

const REQUIRED_ENV_VARS = [
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "EMAIL_USER",
  "EMAIL_PASSWORD",
  "FRONTEND_URL",
];

const missingVars = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missingVars.length) {
  logger.error(`Missing required environment variables: ${missingVars.join(", ")}`);
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
}

const WEAK_SECRETS = ["devsecretkey", "devrefreshkey", "secret", "changeme", "jwt_secret", "mysecret", "password"];
if (process.env.NODE_ENV === "production") {
  if (
    WEAK_SECRETS.includes(process.env.JWT_SECRET) ||
    WEAK_SECRETS.includes(process.env.JWT_REFRESH_SECRET) ||
    (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) ||
    (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32)
  ) {
    logger.error("FATAL: Weak JWT secret detected in production. Set strong secrets and restart.");
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

    logger.info(`Connecting to MongoDB (Attempt ${6 - retryCount}/5)...`);

    // For local development or non-Vercel deployments
    const db = await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    isConnected = db.connections[0].readyState === 1;
    logger.info("MongoDB connected");
    return Promise.resolve();
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    if (retryCount > 1) {
      logger.info("Retrying MongoDB connection in 5 seconds...");
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
    logger.info("Database connection established");

    try {
      const { startMediaCleanupCron } = require("./services/mediaCleanupService");
      startMediaCleanupCron();
    } catch (cronError) {
      logger.warn("Failed to start media cleanup cron", { error: cronError.message });
    }

    try {
      const { startCsvImageCleanupCron } = require("./services/csvImageCleanupService");
      startCsvImageCleanupCron();
    } catch (cronError) {
      logger.warn("Failed to start CSV image cleanup cron", { error: cronError.message });
    }

    try {
      const { startCleanupCron, runCleanupOnStartup } = require("./jobs/cleanupExpiredAssets");
      startCleanupCron();
      runCleanupOnStartup();
    } catch (cronError) {
      logger.warn("Failed to start expired assets cleanup cron", { error: cronError.message });
    }

    const http = require("http");
    const server = http.createServer(app);

    const socketService = require("./services/socketService");
    socketService.init(server);

    server.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`API docs: http://localhost:${PORT}/api-docs/`);
    });
  } catch (error) {
    logger.error("Failed to start server", { error: error.message });
    if (process.env.NODE_ENV !== "production") {
      process.exit(1);
    }
  }
};

// Start the server
startServer();

module.exports = app;
