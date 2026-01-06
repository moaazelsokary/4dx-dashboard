const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const rateLimiter = require('./utils/rate-limiter');

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

  const password = process.env.DB_PASSWORD || process.env.VITE_PWD || process.env.PWD;
  
  const config = {
    user: process.env.UID || process.env.VITE_UID || process.env.VIE_UID,
    password: password,
    server: server,
    port: port,
    database: process.env.DATABASE || process.env.VITE_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
  };

  try {
    pool = await sql.connect(config);
    logger.info('Database connection established for auth-api');
    return pool;
  } catch (error) {
    logger.error('Database connection failed', error);
    throw error;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Apply rate limiting (login type: 5 requests per 15 minutes)
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

  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ success: false, error: 'Method not allowed' }),
      };
    }

    const { username, password } = JSON.parse(event.body || '{}');

    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Username and password required' }),
      };
    }

    // Get database connection
    const pool = await getDbPool();
    
    // Query user from database
    const request = pool.request();
    request.input('username', sql.NVarChar, username);
    
    const result = await request.query(`
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

    if (result.recordset.length === 0) {
      logger.warn('Login attempt with invalid username', { username });
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid username or password' }),
      };
    }

    const user = result.recordset[0];

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
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
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
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        departments: departments,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const userData = {
      username: user.username,
      role: user.role,
      departments: departments,
    };

    logger.info('User signed in successfully', { username: user.username, role: user.role });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        user: userData,
        token,
      }),
    };
  } catch (error) {
    logger.error('Authentication error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
});

exports.handler = handler;

