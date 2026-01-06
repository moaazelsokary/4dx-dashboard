const fetch = require('node-fetch');
const rateLimiter = require('./utils/rate-limiter');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;

const WORKSHEET_NAMES = [
  'Overall Targets',
  'Target quarters Vs Actual',
  'Services Target Q  Vs Actual',
  'Projects'
];

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
    
    // Keep the original email format like the local proxy does
    // Don't convert hamed_ibrahim_lifemakers_org to hamed_ibrahim@lifemakers.org
    // The Microsoft Graph API works with the original format
    
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

async function getSiteId(accessToken, userEmail) {
  // Try different site URL formats like the local proxy
  const siteUrls = [
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/sites/personal/${userEmail}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail.replace('@', '_')}`,
    `https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/${userEmail.split('@')[0]}`
  ];
  
  for (const siteUrl of siteUrls) {
    console.log(`Trying site URL: ${siteUrl}`);
    
    try {
      const response = await fetch(siteUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Got site ID: ${data.id} from ${siteUrl}`);
        return data.id;
      } else {
        const errorText = await response.text();
        console.log(`Site URL failed: ${response.status}`, errorText);
      }
    } catch (e) {
      console.log(`Site URL error:`, e.message);
    }
  }
  
  throw new Error('All site URL formats failed');
}

async function getWorksheetData(accessToken, userEmail, fileId, worksheetName, range = 'A1:BC100', useSiteEndpoint = false, siteId = null) {
  // URL encode worksheet name
  const worksheetIdentifier = encodeURIComponent(worksheetName);
  
  let url;
  if (useSiteEndpoint && siteId) {
    url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${worksheetIdentifier}')/range(address='${range}')`;
  } else {
    url = `https://graph.microsoft.com/v1.0/users/${userEmail}/drive/items/${fileId}/workbook/worksheets('${worksheetIdentifier}')/range(address='${range}')`;
  }
  
  console.log(`Requesting URL: ${url}`);
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  console.log(`Response status for ${worksheetName}: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`HTTP ${response.status} for ${worksheetName}:`, errorText);
    console.error(`Full URL that failed: ${url}`);
    throw new Error(`Failed to get worksheet data for ${worksheetName}: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log(`Successfully got data for ${worksheetName}, rows: ${data.values ? data.values.length : 0}`);
  return data.values;
}

// Apply rate limiting (export type: 10 requests per hour)
const handler = rateLimiter('export')(async function(event) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Check if environment variables are available
    if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
      console.error('Missing environment variables:', { 
        CLIENT_ID: !!CLIENT_ID, 
        CLIENT_SECRET: !!CLIENT_SECRET, 
        TENANT_ID: !!TENANT_ID 
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Missing environment variables' })
      };
    }

    const { oneDriveUrl, range } = event.queryStringParameters || {};
    if (!oneDriveUrl) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: 'Missing oneDriveUrl parameter' })
      };
    }

    console.log('Processing OneDrive URL:', oneDriveUrl);
    const { fileId, userEmail } = extractFileIdAndUserEmail(oneDriveUrl);
    console.log('Extracted:', { fileId, userEmail });
    
    if (!fileId || !userEmail) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: 'Invalid OneDrive URL - could not extract fileId or userEmail' })
      };
    }

    const accessToken = await getAccessToken();
    console.log('Got access token');
    
    // Try with original email format first (like local proxy)
    console.log('Trying with original email format...');
    const originalEmail = 'hamed_ibrahim_lifemakers_org';
    let useSiteEndpoint = false;
    let siteId = null;
    
    // Try direct access with original email
    try {
      const testUrl = `https://graph.microsoft.com/v1.0/users/${originalEmail}/drive/items/${fileId}`;
      console.log(`Testing direct access with original email: ${testUrl}`);
      
      const testResponse = await fetch(testUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (testResponse.ok) {
        console.log('Direct access with original email successful!');
        userEmail = originalEmail; // Use original email
      } else {
        console.log('Direct access with original email failed, trying site endpoint...');
        useSiteEndpoint = true;
        try {
          siteId = await getSiteId(accessToken, originalEmail);
          console.log('Successfully got site ID with original email:', siteId);
        } catch (siteError) {
          console.error('Failed to get site ID with original email:', siteError.message);
          useSiteEndpoint = false;
        }
      }
    } catch (e) {
      console.log('Direct access with original email failed, trying site endpoint...');
      useSiteEndpoint = true;
      try {
        siteId = await getSiteId(accessToken, originalEmail);
        console.log('Successfully got site ID with original email:', siteId);
      } catch (siteError) {
        console.error('Failed to get site ID with original email:', siteError.message);
        useSiteEndpoint = false;
      }
    }
    
    const results = {};
    for (const worksheetName of WORKSHEET_NAMES) {
      try {
        console.log(`Fetching worksheet: ${worksheetName}`);
        results[worksheetName] = await getWorksheetData(accessToken, userEmail, fileId, worksheetName, range || 'A1:BC100', useSiteEndpoint, siteId);
        console.log(`Successfully fetched: ${worksheetName}`);
      } catch (e) {
        console.error(`Error fetching ${worksheetName}:`, e.message);
        results[worksheetName] = { error: e.message };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ worksheets: results })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
});

exports.handler = handler; 