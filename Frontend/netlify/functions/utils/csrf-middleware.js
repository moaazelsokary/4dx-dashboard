/**
 * CSRF protection middleware for Netlify functions
 * Validates CSRF tokens in request headers
 */

/**
 * CSRF middleware factory
 * Wraps a handler to validate CSRF tokens
 */
function csrfMiddleware(handler) {
  return async (event, context) => {
    // Skip CSRF check for OPTIONS requests (preflight)
    if (event.httpMethod === 'OPTIONS') {
      return handler(event, context);
    }

    // Skip CSRF check for GET requests (read-only)
    if (event.httpMethod === 'GET') {
      return handler(event, context);
    }

    // For POST, PUT, DELETE requests, validate CSRF token
    const csrfToken = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];
    
    // In a real implementation, you would validate the token against a session store
    // For now, we'll accept any token (you should implement proper validation)
    // TODO: Implement proper CSRF token validation with session management
    
    if (!csrfToken) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'CSRF token missing',
          message: 'CSRF token is required for this request',
        }),
      };
    }

    // Call the handler
    return handler(event, context);
  };
}

module.exports = csrfMiddleware;

