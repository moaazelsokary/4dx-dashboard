require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3001;

// Azure AD Configuration
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;

// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Server-side token endpoint
app.post('/api/token', async (req, res) => {
  try {
    console.log('[Proxy] Getting access token...');
    
    const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Proxy] Token request failed:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    console.log('[Proxy] Successfully obtained access token');
    res.json(data);
  } catch (error) {
    console.error('[Proxy] Error getting token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy middleware for Microsoft Graph API with authentication
app.use('/api/sharepoint', async (req, res, next) => {
  try {
    // Get access token first
    const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Proxy] Token request failed:', tokenResponse.status, errorText);
      return res.status(tokenResponse.status).json({ error: errorText });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Add authorization header to the request
    req.headers['Authorization'] = `Bearer ${accessToken}`;
    
    // Continue to proxy
    next();
  } catch (error) {
    console.error('[Proxy] Error in authentication middleware:', error);
    res.status(500).json({ error: error.message });
  }
}, createProxyMiddleware({
  target: 'https://graph.microsoft.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/sharepoint': ''
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Proxy server is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`🔐 Handling authentication server-side`);
}); 