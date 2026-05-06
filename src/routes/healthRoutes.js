const express = require('express');
const router = express.Router();
const {
  checkDatabaseHealth,
  pingDatabase,
  getCompleteHealth,
  checkEnvironmentVariables,
  getIPInfo,
  getConnectionLogs
} = require('../controllers/health/healthController');
const verifyToken = require('../middlewares/authMiddleware');
const requireAdmin = require('../middlewares/adminMiddleware');

/**
 * @swagger
 * tags:
 *   name: Health
 *   description: System health check endpoints
 */

/**
 * @swagger
 * /api/v1/health/database:
 *   get:
 *     summary: Check MongoDB connection status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database is connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 database:
 *                   type: object
 *                 message:
 *                   type: string
 *       503:
 *         description: Database is not connected
 */
router.get('/database', verifyToken, requireAdmin, checkDatabaseHealth);

/**
 * @swagger
 * /api/v1/health/ping:
 *   get:
 *     summary: Ping database to verify connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database ping successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 message:
 *                   type: string
 *                 responseTime:
 *                   type: string
 *                 database:
 *                   type: object
 *       503:
 *         description: Database ping failed
 */
router.get('/ping', verifyToken, requireAdmin, pingDatabase);

/**
 * @swagger
 * /api/v1/health/status:
 *   get:
 *     summary: Complete health check (server + database)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All systems operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                 server:
 *                   type: object
 *                 database:
 *                   type: object
 *                 message:
 *                   type: string
 *       503:
 *         description: System health issue detected
 */
router.get('/status', verifyToken, requireAdmin, getCompleteHealth);

/**
 * @swagger
 * /api/v1/health/env-check:
 *   get:
 *     summary: Check if environment variables are loaded (debugging only)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Environment variables status
 */
router.get('/env-check', verifyToken, requireAdmin, checkEnvironmentVariables);

/**
 * @swagger
 * /api/v1/health/ip-info:
 *   get:
 *     summary: Get current IP address for MongoDB whitelist
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: IP address information
 */
router.get('/ip-info', verifyToken, requireAdmin, getIPInfo);

/**
 * @swagger
 * /api/v1/health/connection-logs:
 *   get:
 *     summary: Get detailed MongoDB connection logs and diagnostics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed connection information
 */
router.get('/connection-logs', verifyToken, requireAdmin, getConnectionLogs);

module.exports = router;
