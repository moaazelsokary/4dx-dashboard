const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Only allow GET and POST
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Get secrets from environment variables
  const CLIENT_ID = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  const TENANT_ID = process.env.TENANT_ID;

  // Get the apiPath from query string
  const apiPath = event.queryStringParameters && event.queryStringParameters.apiPath;
  if (!apiPath) {
    return { statusCode: 400, body: "Missing apiPath parameter" };
  }

  // Get access token
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials'
  });

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return { statusCode: tokenResponse.status, body: errorText };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Forward the request to Microsoft Graph API
    const apiUrl = 'https://graph.microsoft.com' + apiPath;
    const apiResponse = await fetch(apiUrl, {
      method: event.httpMethod,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: event.httpMethod === "POST" ? event.body : undefined
    });

    const apiData = await apiResponse.text();

    return {
      statusCode: apiResponse.status,
      body: apiData,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
}; 