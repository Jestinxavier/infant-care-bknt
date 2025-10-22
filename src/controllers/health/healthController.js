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

    // DETAILED DIAGNOSTIC INFO
    const diagnostics = {
      connectionState: dbState,
      stateDescription: status,
      mongooseVersion: mongoose.version,
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'not set',
      vercelEnvironment: !!process.env.VERCEL,
      uriConfigured: !!process.env.MONGODB_URI,
      uriPreview: process.env.MONGODB_URI 
        ? process.env.MONGODB_URI.substring(0, 60) + '...'
        : 'NOT SET',
      connectionOptions: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 1
      },
      lastError: mongoose.connection.error ? {
        message: mongoose.connection.error.message,
        code: mongoose.connection.error.code,
        name: mongoose.connection.error.name
      } : null
    };

    // Prepare response
    const response = {
      success: isHealthy,
      status: status,
      timestamp: new Date().toISOString(),
      database: dbInfo,
      diagnostics: diagnostics,
      message: isHealthy 
        ? '✅ Database is connected and healthy' 
        : `❌ Database is ${status}`
    };

    // Add error details if not connected
    if (!isHealthy) {
      response.troubleshooting = {
        possibleReasons: [
          'MongoDB server is down',
          'Invalid MONGODB_URI in .env file',
          'Network connectivity issues',
          'Authentication failed',
          'Database does not exist',
          'IP not whitelisted in MongoDB Atlas'
        ],
        checkList: [
          'Verify MONGODB_URI is set in Vercel dashboard',
          'Check URI includes database name: /onlineshopping',
          'Whitelist 0.0.0.0/0 in MongoDB Atlas Network Access',
          'Wait 2-3 minutes after IP whitelist changes',
          'Verify MongoDB cluster is active (not paused)',
          'Check username and password are correct'
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
      },
      diagnostics: {
        uriConfigured: !!process.env.MONGODB_URI,
        vercelEnvironment: !!process.env.VERCEL,
        nodeVersion: process.version
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

/**
 * @route   GET /api/v1/health/connection-logs
 * @desc    Get detailed connection logs and diagnostics
 * @access  Public
 */
const getConnectionLogs = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    // Detailed connection state
    const connectionDetails = {
      readyState: mongoose.connection.readyState,
      readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      host: mongoose.connection.host || 'not connected',
      name: mongoose.connection.name || 'not connected',
      port: mongoose.connection.port || 'not connected',
      user: mongoose.connection.user || 'not available',
      
      // Connection configuration
      config: {
        serverSelectionTimeoutMS: mongoose.connection.options?.serverSelectionTimeoutMS || 'not set',
        socketTimeoutMS: mongoose.connection.options?.socketTimeoutMS || 'not set',
        maxPoolSize: mongoose.connection.options?.maxPoolSize || 'not set',
        minPoolSize: mongoose.connection.options?.minPoolSize || 'not set'
      },
      
      // Models and collections
      models: Object.keys(mongoose.connection.models || {}),
      collections: Object.keys(mongoose.connection.collections || {}),
      
      // Connection client info
      client: {
        isConnected: mongoose.connection.readyState === 1,
        isPending: mongoose.connection.readyState === 2,
        serverInfo: mongoose.connection.client ? {
          platform: mongoose.connection.client.platform,
          driver: mongoose.connection.client.driver
        } : 'not available'
      }
    };

    // Environment diagnostics
    const environmentDiagnostics = {
      mongodbUri: {
        exists: !!process.env.MONGODB_URI,
        length: process.env.MONGODB_URI?.length || 0,
        preview: process.env.MONGODB_URI 
          ? `${process.env.MONGODB_URI.substring(0, 30)}...${process.env.MONGODB_URI.substring(process.env.MONGODB_URI.length - 30)}`
          : 'NOT SET',
        hasProtocol: process.env.MONGODB_URI?.startsWith('mongodb+srv://') || false,
        hasDatabase: process.env.MONGODB_URI?.includes('/onlineshopping') || false,
        hasOptions: process.env.MONGODB_URI?.includes('?') || false
      },
      nodejs: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        }
      },
      vercel: {
        isVercel: !!process.env.VERCEL,
        region: process.env.VERCEL_REGION || 'not on vercel',
        env: process.env.VERCEL_ENV || 'not on vercel'
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'not set',
        port: process.env.PORT || 'not set'
      }
    };

    // Last connection error if any
    const lastError = mongoose.connection.error ? {
      message: mongoose.connection.error.message,
      name: mongoose.connection.error.name,
      code: mongoose.connection.error.code,
      stack: process.env.NODE_ENV === 'development' ? mongoose.connection.error.stack : 'hidden in production'
    } : null;

    // Connection timeline
    const connectionTimeline = {
      serverStartTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      currentTime: new Date().toISOString(),
      uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m ${Math.floor(process.uptime() % 60)}s`
    };

    return res.status(200).json({
      success: mongoose.connection.readyState === 1,
      timestamp: new Date().toISOString(),
      connection: connectionDetails,
      environment: environmentDiagnostics,
      timeline: connectionTimeline,
      lastError: lastError,
      recommendation: mongoose.connection.readyState !== 1 ? {
        message: 'Database is not connected',
        steps: [
          '1. Verify MONGODB_URI is set in Vercel Environment Variables',
          '2. Check URI format: mongodb+srv://user:pass@host/onlineshopping?options',
          '3. Ensure database name "/onlineshopping" is present in URI',
          '4. Whitelist 0.0.0.0/0 in MongoDB Atlas Network Access',
          '5. Wait 2-3 minutes after making changes',
          '6. Redeploy on Vercel without cache'
        ]
      } : {
        message: 'Database is connected successfully',
        status: 'healthy'
      }
    });

  } catch (error) {
    console.error('❌ Connection logs error:', error);
    
    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      message: '❌ Failed to retrieve connection logs',
      error: {
        message: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

module.exports = {
  checkDatabaseHealth,
  pingDatabase,
  getCompleteHealth,
  checkEnvironmentVariables,
  getIPInfo,
  getConnectionLogs
};
