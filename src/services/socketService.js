const { Server } = require("socket.io");
const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const parseCookieHeader = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});

const getAdminUserIdFromCookies = (socket) => {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie || "");
  return (
    cookies.dashboard_access_token ||
    cookies.access_token ||
    cookies.dashboard_refresh_token ||
    cookies.refresh_token ||
    null
  );
};

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

    const token = getAdminUserIdFromCookies(socket);
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const User = require("../models/user");
        User.findById(payload.id)
          .select("role")
          .then((user) => {
            const adminRoles = ["admin", "super-admin", "developer"];
            if (user && adminRoles.includes(user.role)) {
              socket.join("admins");
              socket.emit("authenticated", { success: true });
            }
          })
          .catch(() => {});
      } catch {
        // Invalid token — remain unauthenticated, no admin events
      }
    }

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
    io.to("admins").emit(event, data);
    logger.debug("Socket event emitted", { event });
  }
};

module.exports = { init, getIO, emitEvent };
