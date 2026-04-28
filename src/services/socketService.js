const { Server } = require("socket.io");
const logger = require("../utils/logger");

let io;

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? [process.env.FRONTEND_URL, process.env.DASHBOARD_URL].filter(Boolean)
          : /^http:\/\/localhost:\d+$/,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Attach Redis pub/sub adapter for multi-instance deployments when Redis is configured
  if (process.env.REDIS_URL) {
    try {
      const { createAdapter } = require("@socket.io/redis-adapter");
      const { createClient } = require("ioredis");
      const pubClient = createClient({ lazyConnect: true });
      const subClient = pubClient.duplicate();
      pubClient.connect().then(() => subClient.connect()).then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info("Socket.io Redis adapter attached");
      }).catch((err) => {
        logger.warn("Socket.io Redis adapter failed, falling back to in-memory", { error: err.message });
      });
    } catch {
      logger.warn("@socket.io/redis-adapter not installed — running single-instance Socket.io");
    }
  }

  io.on("connection", (socket) => {
    logger.debug("Socket connected", { socketId: socket.id });
    socket.on("disconnect", () => {
      logger.debug("Socket disconnected", { socketId: socket.id });
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};

const emitEvent = (event, data) => {
  if (io) {
    io.emit(event, data);
    logger.debug("Socket event emitted", { event });
  }
};

module.exports = { init, getIO, emitEvent };
