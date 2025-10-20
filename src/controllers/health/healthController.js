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
          'Invalid MONGODB_URI in .env file',
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

/**
 * @route   GET /api/v1/health/env-check
 * @desc    Check if environment variables are loaded (for debugging)
 * @access  Public
 */
const checkEnvironmentVariables = async (req, res) => {
  try {
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET',
      PORT: process.env.PORT || 'NOT_SET',
      MONGODB_URI_EXISTS: !!process.env.MONGODB_URI,
      MONGODB_URI_LENGTH: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
      MONGODB_URI_PREVIEW: process.env.MONGODB_URI 
        ? `${process.env.MONGODB_URI.substring(0, 20)}...` 
        : 'NOT_SET',
      JWT_SECRET_EXISTS: !!process.env.JWT_SECRET,
      CLOUDINARY_EXISTS: !!process.env.CLOUDINARY_CLOUD_NAME,
      EMAIL_USER_EXISTS: !!process.env.EMAIL_USER,
      VERCEL: process.env.VERCEL || 'NOT_ON_VERCEL',
      ALL_ENV_KEYS: Object.keys(process.env).filter(key => 
        !key.startsWith('npm_') && 
        !key.startsWith('_') &&
        !key.includes('PATH')
      ).sort()
    };

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Environment variables check',
      environment: envCheck,
      warning: 'This endpoint should be disabled in production!'
    });

  } catch (error) {
    console.error('❌ Environment check error:', error);
    
    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      message: '❌ Failed to check environment variables',
      error: {
        message: error.message
      }
    });
  }
};

/**
 * @route   GET /api/v1/health/ip-info
 * @desc    Get current IP address and network information
 * @access  Public
 */
const getIPInfo = async (req, res) => {
  try {
    // Get IP from various sources
    const ipInfo = {
      // From request headers
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'cf-connecting-ip': req.headers['cf-connecting-ip'], // Cloudflare
      'x-vercel-forwarded-for': req.headers['x-vercel-forwarded-for'], // Vercel
      
      // From Express
      'req.ip': req.ip,
      'req.ips': req.ips,
      'socket.remoteAddress': req.socket?.remoteAddress,
      
      // Connection info
      'req.connection.remoteAddress': req.connection?.remoteAddress,
      
      // All headers (for debugging)
      'all_headers': req.headers
    };

    // Extract the most likely public IP
    const publicIP = 
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.headers['x-vercel-forwarded-for'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      'Unknown';

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'IP Information',
      publicIP: publicIP,
      details: ipInfo,
      instructions: {
        step1: 'Copy the "publicIP" value above',
        step2: 'Go to MongoDB Atlas → Network Access',
        step3: 'Click "Add IP Address"',
        step4: 'Paste the IP address',
        step5: 'Click "Confirm"',
        note: 'Or use 0.0.0.0/0 to allow all IPs (easier but less secure)'
      }
    });

  } catch (error) {
    console.error('❌ IP info error:', error);
    
    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      message: '❌ Failed to get IP information',
      error: {
        message: error.message
      }
    });
  }
};

module.exports = {
  checkDatabaseHealth,
  pingDatabase,
  getCompleteHealth,
  checkEnvironmentVariables,
  getIPInfo
};
