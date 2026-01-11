require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors({
  origin: function(origin, callback) {
    if (
      !origin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('https://lifemakers.netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Database connection pool
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
    console.log('[Auth Proxy] Database connection established');
    return pool;
  } catch (error) {
    console.error('[Auth Proxy] Database connection failed:', error.message);
    throw error;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Handle preflight requests
app.options('/api/auth/signin', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.sendStatus(200);
});

// Authentication endpoint
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password required' 
      });
    }

    // Get database connection
    const dbPool = await getDbPool();
    
    // Query user from database
    const request = dbPool.request();
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
      console.warn('[Auth Proxy] Login attempt with invalid username:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    const user = result.recordset[0];

    // Check if user is active
    if (!user.is_active) {
      console.warn('[Auth Proxy] Login attempt for inactive user:', username);
      return res.status(403).json({ 
        success: false, 
        error: 'Account is disabled' 
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      console.warn('[Auth Proxy] Login attempt with invalid password for:', username);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
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

    console.log('[Auth Proxy] User signed in successfully:', user.username, 'Role:', user.role);

    res.json({
      success: true,
      user: userData,
      token,
    });
  } catch (error) {
    console.error('[Auth Proxy] Authentication error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Auth proxy server is running', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🔐 Auth proxy server running on http://localhost:${PORT}`);
  console.log(`📡 Handling authentication requests`);
  console.log(`💡 Make sure database credentials are set in .env.local`);
});
