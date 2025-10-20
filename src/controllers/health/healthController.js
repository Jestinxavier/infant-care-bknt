const mongoose = require('mongoose');

/**
 * @route   GET /api/v1/health/database
 * @desc    Check MongoDB connection status
 * @access  Public
 */
const checkDatabaseHealth = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    
    // Connection states:
    // 0 = disconnected
    // 1 = connected
    // 2 = connecting
    // 3 = disconnecting
    
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const status = stateMap[dbState] || 'unknown';
    const isHealthy = dbState === 1;

    // Get database info if connected
    let dbInfo = null;
    if (isHealthy) {
      dbInfo = {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        port: mongoose.connection.port,
        models: Object.keys(mongoose.connection.models),
        collections: Object.keys(mongoose.connection.collections)
      };
    }

    // Prepare response
    const response = {
      success: isHealthy,
      status: status,
      timestamp: new Date().toISOString(),
      database: dbInfo,
      message: isHealthy 
        ? '✅ Database is connected and healthy' 
        : `❌ Database is ${status}`
    };

    // Add error details if not connected
    if (!isHealthy) {
      response.error = {
        state: dbState,
        details: 'Database connection is not established',
        possibleReasons: [
          'MongoDB server is down',
          'Invalid MONGO_URI in .env file',
          'Network connectivity issues',
          'Authentication failed',
          'Database does not exist'
        ]
      };
    }

    return res.status(isHealthy ? 200 : 503).json(response);

  } catch (error) {
    console.error('❌ Health check error:', error);
    
    return res.status(503).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      message: '❌ Failed to check database health',
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

/**
 * @route   GET /api/v1/health/ping
 * @desc    Ping database to verify connectivity
 * @access  Public
 */
const pingDatabase = async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Attempt to ping the database
    await mongoose.connection.db.admin().ping();
    
    const responseTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      status: 'connected',
      timestamp: new Date().toISOString(),
      message: '✅ Database ping successful',
      responseTime: `${responseTime}ms`,
      database: {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        port: mongoose.connection.port
      }
    });

  } catch (error) {
    console.error('❌ Database ping failed:', error);
    
    return res.status(503).json({
      success: false,
      status: 'error',
      timestamp: new Date().toISOString(),
      message: '❌ Database ping failed',
      error: {
        message: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

/**
 * @route   GET /api/v1/health/status
 * @desc    Complete health check including server and database
 * @access  Public
 */
const getCompleteHealth = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;

    // Server uptime
    const uptime = process.uptime();
    const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memoryFormatted = {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
    };

    const response = {
      success: isDbConnected,
      timestamp: new Date().toISOString(),
      server: {
        status: 'running',
        uptime: uptimeFormatted,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        platform: process.platform,
        memory: memoryFormatted
      },
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        readyState: dbState,
        host: isDbConnected ? mongoose.connection.host : null,
        name: isDbConnected ? mongoose.connection.name : null,
        port: isDbConnected ? mongoose.connection.port : null
      },
      message: isDbConnected 
        ? '✅ All systems operational' 
        : '⚠️ Database connection issue detected !Let me check the database'
    };

    // Add error details if database is not connected
    if (!isDbConnected) {
      response.database.error = {
        message: 'Database not connected',
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown'
      };
    }

    return res.status(isDbConnected ? 200 : 503).json(response);

  } catch (error) {
    console.error('❌ Complete health check failed:', error);
    
    return res.status(503).json({
      success: false,
      timestamp: new Date().toISOString(),
      message: '❌ Health check failed',
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

module.exports = {
  checkDatabaseHealth,
  pingDatabase,
  getCompleteHealth
};
