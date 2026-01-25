const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');

// Authentication API - Database-based user authentication

// Database connection (reuse from db.cjs if available)
let pool = null;

async function getDbPool() {
  if (pool) return pool;
  
  const serverValue = process.env.SERVER || process.env.VITE_SERVER || '';
  let server, port;
  if (serverValue.includes(',')) {
    [server, port] = serverValue.split(',').map(s => s.trim());
    port = parseInt(port) || 1433;
  } else {
    server = serverValue;
    port = 1433;
  }

  // Robust password handling (match wig-api.js and config-api.js)
  let password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  if (password && password.startsWith('/')) {
    password = process.env.DB_PASSWORD || process.env.VITE_PWD;
  }
  if (password && (password.includes('%'))) {
    try {
      password = decodeURIComponent(password);
    } catch (e) {
      // Keep original if decode fails
    }
  }
  if ((password && password.startsWith('"') && password.endsWith('"')) || 
      (password && password.startsWith("'") && password.endsWith("'"))) {
    password = password.slice(1, -1);
  }
  if (password) {
    password = password.trim();
  }
  
  const config = {
    user: process.env.DB_USER || process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password: password,
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      enableArithAbort: true,
      requestTimeout: 60000,
      connectionTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  try {
    console.log('[Auth API] Attempting database connection...', {
      server: server,
      port: port,
      database: config.database,
      user: config.user,
      hasPassword: !!password
    });
    pool = await sql.connect(config);
    logger.info('Database connection established for auth-api');
    console.log('[Auth API] Database connection successful');
    return pool;
  } catch (error) {
    logger.error('Database connection failed', error);
    console.error('[Auth API] Database connection error:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    throw error;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Apply rate limiting (login type: 20 requests per 15 minutes)
const handler = rateLimiter('login')(async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Log request for debugging
  logger.info('[Auth API] Request received', {
    method: event.httpMethod,
    path: event.path,
    hasBody: !!event.body,
    bodyLength: event.body ? event.body.length : 0
  });

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ success: false, error: 'Method not allowed' }),
      };
    }

    // Parse request body with error handling
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      logger.error('Failed to parse request body', { error: parseError.message, body: event.body });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid request body' }),
      };
    }

    const { username, password } = body;

    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Username and password required' }),
      };
    }

    // Get database connection
    let pool;
    try {
      pool = await getDbPool();
    } catch (dbError) {
      logger.error('Database connection failed in handler', dbError);
      console.error('[Auth API] Database connection error in handler:', {
        message: dbError.message,
        code: dbError.code,
        name: dbError.name
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Database connection failed',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        }),
      };
    }
    
    // Query user from database
    let result;
    try {
      const request = pool.request();
      request.input('username', sql.NVarChar, username);
      
      result = await request.query(`
        SELECT 
          id,
          username,
          password_hash,
          role,
          departments,
          is_active
        FROM users
        WHERE username = @username
      `);
    } catch (queryError) {
      logger.error('Database query failed', { username, error: queryError.message, code: queryError.code });
      console.error('[Auth API] Query error:', {
        message: queryError.message,
        code: queryError.code,
        name: queryError.name
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Database query failed',
          details: process.env.NODE_ENV === 'development' ? queryError.message : undefined
        }),
      };
    }

    if (result.recordset.length === 0) {
      logger.warn('Login attempt with invalid username', { username });
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid username or password' }),
      };
    }

    const user = result.recordset[0];

    // Validate user data
    if (!user.password_hash) {
      logger.error('User found but password_hash is missing', { username, userId: user.id });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'User account configuration error' }),
      };
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn('Login attempt for inactive user', { username });
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: 'Account is disabled' }),
      };
    }

    // Verify password
    let passwordValid;
    try {
      passwordValid = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      logger.error('Password comparison failed', { username, error: bcryptError.message });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Authentication error' }),
      };
    }
    
    if (!passwordValid) {
      logger.warn('Login attempt with invalid password', { username });
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid username or password' }),
      };
    }

    // Parse departments (stored as JSON string or comma-separated)
    let departments = [];
    try {
      if (typeof user.departments === 'string') {
        departments = JSON.parse(user.departments);
      } else if (Array.isArray(user.departments)) {
        departments = user.departments;
      }
    } catch {
      // If parsing fails, try comma-separated
      departments = user.departments ? user.departments.split(',').map(d => d.trim()) : [];
    }

    // Generate JWT token
    let token;
    try {
      token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
          departments: departments,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );
    } catch (jwtError) {
      logger.error('JWT token generation failed', { username, error: jwtError.message });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Token generation failed' }),
      };
    }

    const userData = {
      username: user.username,
      role: user.role,
      departments: departments,
    };

    logger.info('User signed in successfully', { username: user.username, role: user.role });
    
    // Debug: Log token generation
    console.log('[Auth API] Token generated:', {
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPrefix: token ? token.substring(0, 20) + '...' : 'none',
      userId: user.id,
      username: user.username,
      role: user.role
    });

    const responseBody = {
      success: true,
      user: userData,
      token,
    };
    
    console.log('[Auth API] Response body:', {
      success: responseBody.success,
      hasUser: !!responseBody.user,
      hasToken: !!responseBody.token,
      userRole: responseBody.user?.role
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    // Enhanced error logging
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      originalError: error.originalError ? {
        message: error.originalError.message,
        code: error.originalError.code
      } : undefined
    };
    
    logger.error('[Auth API] Authentication error', errorInfo);
    console.error('[Auth API] Full error details:', errorInfo);
    
    // Provide more detailed error information
    let errorMessage = 'Internal server error';
    let errorDetails = undefined;
    
    // Always include error message in response for better debugging
    // In production, we'll include at least the error message
    errorDetails = {
      message: error.message,
      name: error.name,
      code: error.code
    };
    
    // Include stack trace only in development
    if (process.env.NODE_ENV === 'development' || process.env.NETLIFY_DEV) {
      errorDetails.stack = error.stack?.split('\n').slice(0, 5).join('\n');
    }
    
    // Check for specific error types
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Database connection failed';
    } else if (error.message && error.message.includes('password')) {
      errorMessage = 'Authentication failed';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: errorDetails
      }),
    };
  }
});

// Wrap handler with additional error handling
const wrappedHandler = async (event, context) => {
  try {
    return await handler(event, context);
  } catch (error) {
    // Catch any errors that escape the handler (e.g., from rate limiter)
    logger.error('[Auth API] Unhandled error in wrapper', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    console.error('[Auth API] Unhandled error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? {
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n')
        } : { message: error.message }
      }),
    };
  }
};

exports.handler = wrappedHandler;

