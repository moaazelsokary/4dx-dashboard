const fetch = require('node-fetch');

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
    console.log('🔍 Extracting file ID and user email from URL:', oneDriveUrl);
    
    const url = new URL(oneDriveUrl);
    const params = new URLSearchParams(url.search);
    const sourcedoc = params.get('sourcedoc');
    const fileId = sourcedoc ? sourcedoc.replace(/[{}]/g, '') : null;
    const pathParts = url.pathname.split('/');
    const personalIdx = pathParts.indexOf('personal');
    let userEmail = personalIdx >= 0 ? pathParts[personalIdx + 1] : null;
    
    console.log('🔍 Path parts:', pathParts);
    console.log('🔍 Personal index:', personalIdx);
    console.log('🔍 Raw user email from path:', userEmail);
    
    // Try to fix common email format issues
    if (userEmail && userEmail.includes('_')) {
      // Convert hamed_ibrahim_lifemakers_org to hamed_ibrahim@lifemakers.org
      const parts = userEmail.split('_');
      if (parts.length >= 3) {
        const name = parts[0];
        const domain = parts.slice(2).join('.');
        const convertedEmail = `${name}@${domain}`;
        console.log(`🔍 Converted email from ${userEmail} to ${convertedEmail}`);
        userEmail = convertedEmail;
      }
    }
    
    console.log('🔍 Final extracted values:');
    console.log('  - File ID:', fileId);
    console.log('  - User Email:', userEmail);
    
    return { fileId, userEmail };
  } catch (e) {
    console.error('❌ Error extracting file ID and user email:', e);
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

async function getWorksheetData(accessToken, userEmail, fileId, worksheetName, range = 'A1:BC100') {
  // Try different email formats if the first one fails
  const emailFormats = [
    userEmail, // Original email
    userEmail.replace('@', '_at_'), // Try with _at_ format
    userEmail.replace('@', '_'), // Try with underscore format
    userEmail.split('@')[0] + '@lifemakers.org', // Try with lifemakers.org domain
    userEmail.split('@')[0] + '@lifemaker-my.sharepoint.com' // Try with SharePoint domain
  ];
  
  console.log(`🔗 Trying to get worksheet data for: ${worksheetName}`);
  console.log(`  - File ID: ${fileId}`);
  console.log(`  - Email formats to try:`, emailFormats);
  
  for (let i = 0; i < emailFormats.length; i++) {
    const currentEmail = emailFormats[i];
    console.log(`🔗 Attempt ${i + 1}: Trying email format: ${currentEmail}`);
    
    // URL encode worksheet name
    const worksheetIdentifier = encodeURIComponent(worksheetName);
    const url = `https://graph.microsoft.com/v1.0/users/${currentEmail}/drive/items/${fileId}/workbook/worksheets('${worksheetIdentifier}')/range(address='${range}')`;
    
    console.log(`  - URL: ${url}`);
    
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      console.log(`  - Response status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Successfully got data for ${worksheetName} using email: ${currentEmail}, rows: ${data.values ? data.values.length : 0}`);
        return data.values;
      } else {
        const errorText = await response.text();
        console.log(`  - Failed with email ${currentEmail}: ${response.status} - ${errorText}`);
        
        // If this is the last attempt, throw the error
        if (i === emailFormats.length - 1) {
          console.error(`❌ All email formats failed for ${worksheetName}`);
          throw new Error(`Failed to get worksheet data for ${worksheetName}: ${response.status} ${response.statusText} - ${errorText}`);
        }
      }
    } catch (error) {
      console.log(`  - Error with email ${currentEmail}: ${error.message}`);
      
      // If this is the last attempt, throw the error
      if (i === emailFormats.length - 1) {
        throw error;
      }
    }
  }
}

exports.handler = async function(event) {
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

    console.log('🔄 Processing OneDrive URL:', oneDriveUrl);
    const { fileId, userEmail } = extractFileIdAndUserEmail(oneDriveUrl);
    console.log('✅ Extracted:', { fileId, userEmail });
    
    if (!fileId || !userEmail) {
      return { 
        statusCode: 400, 
        headers,
        body: JSON.stringify({ error: 'Invalid OneDrive URL - could not extract fileId or userEmail' })
      };
    }

    const accessToken = await getAccessToken();
    console.log('Got access token');
    
    const results = {};
    for (const worksheetName of WORKSHEET_NAMES) {
      try {
        console.log(`Fetching worksheet: ${worksheetName}`);
        results[worksheetName] = await getWorksheetData(accessToken, userEmail, fileId, worksheetName, range || 'A1:BC100');
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
}; 