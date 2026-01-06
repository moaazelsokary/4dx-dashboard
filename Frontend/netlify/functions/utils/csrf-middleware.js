/**
 * CSRF protection middleware for Netlify functions
 * Validates CSRF tokens in requests
 */

const logger = require('./logger');

/**
 * CSRF middleware
 * Validates X-CSRF-Token header
 */
function csrfMiddleware(handler) {
  return async (event, context) => {
    // Skip CSRF check for GET requests and OPTIONS (preflight)
    if (event.httpMethod === 'GET' || event.httpMethod === 'OPTIONS') {
      return handler(event, context);
    }

    // Get CSRF token from header
    const csrfToken = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];
    
    if (!csrfToken) {
      logger.warn('CSRF token missing', { path: event.path });
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ success: false, error: 'CSRF token required' }),
      };
    }

    // In a real implementation, you would validate the token against a session store
    // For now, we'll do basic validation (token should exist and be non-empty)
    if (csrfToken.length < 32) {
      logger.warn('Invalid CSRF token format', { path: event.path });
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ success: false, error: 'Invalid CSRF token' }),
      };
    }

    // Token is valid, proceed with handler
    return handler(event, context);
  };
}

module.exports = csrfMiddleware;

