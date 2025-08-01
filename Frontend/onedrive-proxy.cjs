require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3002; // Different port from SharePoint proxy

// Azure AD Configuration
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;

const WORKSHEET_NAMES = [
  'Overall Targets',
  'Target quarters Vs Actual',
  'Services Target Q  Vs Actual', // Note: double space after "Q"
  'Projects'
];

// Enable CORS for all routes
app.use(cors({
  origin: function(origin, callback) {
    if (
      !origin ||
      origin.startsWith('http://localhost:8080') ||
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

// Helper to extract fileId and userEmail from OneDrive URL
function extractFileIdAndUserEmail(oneDriveUrl) {
  try {
    const url = new URL(oneDriveUrl);
    const params = new URLSearchParams(url.search);
    const sourcedoc = params.get('sourcedoc');
    const fileId = sourcedoc ? sourcedoc.replace(/[{}]/g, '') : null;
    const pathParts = url.pathname.split('/');
    const personalIdx = pathParts.indexOf('personal');
    let userEmail = personalIdx >= 0 ? pathParts[personalIdx + 1] : null;
    
    // Try to fix common email format issues
    if (userEmail && userEmail.includes('_')) {
      // Convert hamed_ibrahim_lifemakers_org to hamed_ibrahim@lifemakers.org
      const parts = userEmail.split('_');
      if (parts.length >= 3) {
        const name = parts[0];
        const domain = parts.slice(2).join('.');
        userEmail = `${name}@${domain}`;
        console.log(`[OneDrive Proxy] Converted email from ${pathParts[personalIdx + 1]} to ${userEmail}`);
      }
    }
    
    return { fileId, userEmail };
  } catch (e) {
    return { fileId: null, userEmail: null };
  }
}

async function getAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!response.ok) throw new Error('Failed to get access token');
  const data = await response.json();
  return data.access_token;
}

async function getWorksheetNames(accessToken, userEmail, fileId, useSiteEndpoint = false, siteId = null) {
  let url;
  if (useSiteEndpoint && siteId) {
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}/workbook/worksheets`;
  } else {
    url = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive/items/${fileId}/workbook/worksheets`;
  }
  
  console.log(`[OneDrive Proxy] Getting worksheet names from: ${url}`);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  console.log(`[OneDrive Proxy] Worksheet names response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OneDrive Proxy] Failed to get worksheet names. Status: ${response.status}`);
    console.error(`[OneDrive Proxy] Error response: ${errorText}`);
    throw new Error(`Failed to get worksheet names: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[OneDrive Proxy] Worksheet names response:`, data);
  
  if (!data.value || !Array.isArray(data.value)) {
    console.error(`[OneDrive Proxy] Unexpected response format:`, data);
    throw new Error('Invalid response format for worksheet names');
  }
  
  const worksheetNames = data.value.map(ws => ws.name);
  console.log(`[OneDrive Proxy] Found ${worksheetNames.length} worksheets:`, worksheetNames);
  return worksheetNames;
}

async function getSiteId(accessToken, userEmail) {
  // Try different site URL formats like the PowerShell script
  const siteUrls = [
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/sites/personal/${userEmail}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail.replace('@', '_')}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail.split('@')[0]}`
  ];
  
  for (const siteUrl of siteUrls) {
    console.log(`[OneDrive Proxy] Trying site URL: ${siteUrl}`);
    
    try {
      const response = await fetch(siteUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[OneDrive Proxy] Got site ID: ${data.id} from ${siteUrl}`);
        return data.id;
      } else {
        const errorText = await response.text();
        console.log(`[OneDrive Proxy] Site URL failed: ${response.status}`, errorText);
      }
    } catch (e) {
      console.log(`[OneDrive Proxy] Site URL error:`, e.message);
    }
  }
  
  throw new Error('All site URL formats failed');
}

async function getWorksheetData(accessToken, userEmail, fileId, worksheetName, range = 'A1:Z100', useSiteEndpoint = false, siteId = null) {
  // URL encode worksheet name
  const worksheetIdentifier = encodeURIComponent(worksheetName);
  
  let url;
  if (useSiteEndpoint && siteId) {
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${worksheetIdentifier}')/range(address='${range}')`;
  } else {
    url = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive/items/${fileId}/workbook/worksheets('${worksheetIdentifier}')/range(address='${range}')`;
  }
  
  console.log(`[OneDrive Proxy] Requesting URL: ${url}`);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  console.log(`[OneDrive Proxy] Response status for ${worksheetName}: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OneDrive Proxy] HTTP ${response.status} for ${worksheetName}:`, errorText);
    console.error(`[OneDrive Proxy] Full URL that failed: ${url}`);
    throw new Error(`Failed to get worksheet data for ${worksheetName}: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`[OneDrive Proxy] Successfully got data for ${worksheetName}, rows: ${data.values ? data.values.length : 0}`);
  return data.values;
}

// OneDrive data endpoint
app.get('/api/onedrive', async (req, res) => {
  try {
    console.log('[OneDrive Proxy] Processing request...');
    
    const { oneDriveUrl, range } = req.query;
    if (!oneDriveUrl) {
      return res.status(400).json({ error: 'Missing oneDriveUrl parameter' });
    }

    console.log('[OneDrive Proxy] Processing OneDrive URL:', oneDriveUrl);
    const { fileId, userEmail } = extractFileIdAndUserEmail(oneDriveUrl);
    console.log('[OneDrive Proxy] Extracted:', { fileId, userEmail });
    
    if (!fileId || !userEmail) {
      return res.status(400).json({ error: 'Invalid OneDrive URL - could not extract fileId or userEmail' });
    }

    const accessToken = await getAccessToken();
    console.log('[OneDrive Proxy] Got access token');
    
    // Try with original email format first (like PowerShell script)
    console.log('[OneDrive Proxy] Trying with original email format...');
    const originalEmail = 'hamed_ibrahim_lifemakers_org';
    let useSiteEndpoint = false;
    let siteId = null;
    let availableWorksheets = [];
    
    // Try direct access with original email
    try {
      const testUrl = `https://graph.microsoft.com/v1.0/users/${originalEmail}/drive/items/${fileId}`;
      console.log(`[OneDrive Proxy] Testing direct access with original email: ${testUrl}`);
      
      const testResponse = await fetch(testUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (testResponse.ok) {
        console.log('[OneDrive Proxy] Direct access with original email successful!');
        userEmail = originalEmail; // Use original email
      } else {
        console.log('[OneDrive Proxy] Direct access with original email failed, trying site endpoint...');
        useSiteEndpoint = true;
        try {
          siteId = await getSiteId(accessToken, originalEmail);
          console.log('[OneDrive Proxy] Successfully got site ID with original email:', siteId);
        } catch (siteError) {
          console.error('[OneDrive Proxy] Failed to get site ID with original email:', siteError.message);
          useSiteEndpoint = false;
        }
      }
    } catch (e) {
      console.log('[OneDrive Proxy] Direct access with original email failed, trying site endpoint...');
      useSiteEndpoint = true;
      try {
        siteId = await getSiteId(accessToken, originalEmail);
        console.log('[OneDrive Proxy] Successfully got site ID with original email:', siteId);
      } catch (siteError) {
        console.error('[OneDrive Proxy] Failed to get site ID with original email:', siteError.message);
        useSiteEndpoint = false;
      }
    }
    
    // Get worksheet names
    console.log('[OneDrive Proxy] Getting available worksheet names...');
    try {
      availableWorksheets = await getWorksheetNames(accessToken, userEmail, fileId, useSiteEndpoint, siteId);
      console.log('[OneDrive Proxy] Available worksheets:', availableWorksheets);
      
      // Check if our expected worksheets exist
      for (const expectedName of WORKSHEET_NAMES) {
        if (!availableWorksheets.includes(expectedName)) {
          console.warn(`[OneDrive Proxy] Expected worksheet "${expectedName}" not found in available worksheets`);
        } else {
          console.log(`[OneDrive Proxy] Found expected worksheet: "${expectedName}"`);
        }
      }
    } catch (e) {
      console.error('[OneDrive Proxy] Error getting worksheet names:', e.message);
      console.error('[OneDrive Proxy] Error details:', e);
      // Continue without worksheet names for now
    }
    
    const results = {};
    for (const worksheetName of WORKSHEET_NAMES) {
      try {
        console.log(`[OneDrive Proxy] Fetching worksheet: ${worksheetName}`);
        results[worksheetName] = await getWorksheetData(accessToken, userEmail, fileId, worksheetName, range || 'A1:BC100', useSiteEndpoint, siteId);
        console.log(`[OneDrive Proxy] Successfully fetched: ${worksheetName}`);
      } catch (e) {
        console.error(`[OneDrive Proxy] Error fetching ${worksheetName}:`, e.message);
        results[worksheetName] = { error: e.message };
      }
    }
    
    // Add available worksheets to the response for debugging
    results['_availableWorksheets'] = availableWorksheets;

    res.json({ worksheets: results });
  } catch (error) {
    console.error('[OneDrive Proxy] Error:', error);
    console.error('[OneDrive Proxy] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      details: 'Check server logs for more information'
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'OneDrive proxy is working!',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[OneDrive Proxy] Server running on http://localhost:${PORT}`);
  console.log(`[OneDrive Proxy] Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`[OneDrive Proxy] OneDrive endpoint: http://localhost:${PORT}/api/onedrive`);
}); 