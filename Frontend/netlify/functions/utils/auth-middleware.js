/**
 * Authentication and authorization middleware for Netlify functions
 * Verifies JWT tokens and checks user permissions
 */

const jwt = require('jsonwebtoken');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Extract JWT token from Authorization header
 */
function extractToken(event) {
  // Debug: Log all headers for troubleshooting
  const allHeaders = Object.keys(event.headers || {});
  logger.debug('Extracting token - All headers:', { 
    headerCount: allHeaders.length,
    headerKeys: allHeaders,
    path: event.path,
    method: event.httpMethod
  });
  
  // Check all possible header name variations (case-insensitive)
  // Netlify Functions lowercase all headers, so 'Authorization' becomes 'authorization'
  let authHeader = null;
  
  // Try lowercase first (most common in Netlify Functions)
  authHeader = event.headers['authorization'] || 
               event.headers['Authorization'] ||
               event.headers['AUTHORIZATION'];
  
  // If not found, search case-insensitively
  if (!authHeader) {
    for (const key in event.headers) {
      if (key.toLowerCase() === 'authorization') {
        authHeader = event.headers[key];
        logger.debug('Found authorization header with case variation:', key);
        break;
      }
    }
  }
  
  if (!authHeader) {
    logger.warn('No Authorization header found', { 
      availableHeaders: allHeaders,
      path: event.path,
      method: event.httpMethod
    });
    return null;
  }
  
  logger.debug('Authorization header found', {
    headerLength: authHeader.length,
    headerPrefix: authHeader.substring(0, 30) + '...',
    path: event.path
  });
  
  // Support both "Bearer token" and just "token"
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    const token = parts[1];
    logger.debug('Extracted Bearer token', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...'
    });
    return token;
  } else if (parts.length === 1) {
    logger.debug('Extracted raw token (no Bearer prefix)');
    return parts[0];
  }
  
  logger.warn('Invalid Authorization header format', { 
    header: authHeader.substring(0, 50) + '...',
    path: event.path,
    partsCount: parts.length
  });
  return null;
}

/**
 * Verify JWT token and extract user info
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return {
      valid: true,
      user: decoded,
    };
  } catch (error) {
    logger.warn('Token verification failed', { error: error.message });
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Check if user has required role
 */
function hasRole(user, requiredRoles) {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true; // No role requirement
  }
  
  const userRole = user.role || '';
  return requiredRoles.includes(userRole);
}

/**
 * Check if user has required permission
 * For now, we use role-based checks. In the future, this can be extended
 * to check the role_permissions table for granular permissions.
 */
function hasPermission(user, resource, action) {
  const role = user.role || '';
  
  // CEO and Admin have full access
  if (role === 'CEO' || role === 'Admin') {
    return true;
  }
  
  // Department users can read, update, create, and delete their own department's data
  if (role === 'department') {
    return action === 'read' || action === 'update' || action === 'create' || action === 'delete';
  }
  
  // Editor can read and update (but not delete)
  if (role === 'Editor') {
    return action === 'read' || action === 'update' || action === 'create';
  }
  
  // Viewer can only read
  if (role === 'Viewer') {
    return action === 'read';
  }
  
  return false;
}

/**
 * Authentication middleware factory
 * @param {Object} options - Middleware options
 * @param {string[]} options.requiredRoles - Required roles (e.g., ['CEO', 'Admin'])
 * @param {string} options.resource - Resource name for permission check
 * @param {string} options.action - Action name (read, create, update, delete)
 * @param {boolean} options.optional - If true, authentication is optional (for public endpoints)
 */
function authMiddleware(options = {}) {
  const {
    requiredRoles = [],
    resource = null,
    action = 'read',
    optional = false,
  } = options;

  return (handler) => {
    return async (event, context) => {
      // Skip auth check for OPTIONS requests
      if (event.httpMethod === 'OPTIONS') {
        return handler(event, context);
      }

      // Skip auth check for GET requests if optional
      if (optional && event.httpMethod === 'GET') {
        return handler(event, context);
      }

      // Debug: Log all headers for POST requests to diagnose issues
      const isWriteRequest = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.httpMethod.toUpperCase());
      if (isWriteRequest) {
        logger.info('Auth middleware - Write request received', {
          method: event.httpMethod,
          path: event.path,
          headers: Object.keys(event.headers),
          hasAuthHeader: !!extractToken(event),
        });
      }

      const token = extractToken(event);
      
      // For POST/PUT/DELETE requests, authentication is required even if optional is true
      
      // If optional and no token, proceed without user only for GET requests
      // For write requests, require authentication
      if (optional && !token && !isWriteRequest) {
        return handler(event, context);
      }

      // If not optional and no token, return 401
      // Also require auth for write requests even if optional is true
      if ((!optional || isWriteRequest) && !token) {
        logger.warn('Unauthorized request - no token', { 
          path: event.path, 
          method: event.httpMethod,
          availableHeaders: Object.keys(event.headers),
          headerValues: Object.keys(event.headers).reduce((acc, key) => {
            if (key.toLowerCase().includes('auth')) {
              acc[key] = event.headers[key] ? 'present' : 'missing';
            }
            return acc;
          }, {})
        });
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: 'Authentication required',
            message: 'Please sign in to access this resource',
          }),
        };
      }

      // Verify token
      const tokenResult = verifyToken(token);
      if (!tokenResult.valid) {
        logger.warn('Unauthorized request - invalid token', { path: event.path });
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid or expired token',
            message: 'Please sign in again',
          }),
        };
      }

      const user = tokenResult.user;

      // Check role requirement
      if (requiredRoles.length > 0 && !hasRole(user, requiredRoles)) {
        logger.warn('Forbidden request - insufficient role', {
          path: event.path,
          userRole: user.role,
          requiredRoles,
        });
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: 'Insufficient permissions',
            message: 'You do not have permission to access this resource',
          }),
        };
      }

      // Check permission if resource is specified
      if (resource) {
        const method = event.httpMethod.toUpperCase();
        let actionToCheck = action;
        
        // Map HTTP methods to actions
        if (action === 'read') {
          if (method === 'GET') {
            actionToCheck = 'read';
          } else if (method === 'POST') {
            actionToCheck = 'create';
          } else if (method === 'PUT' || method === 'PATCH') {
            actionToCheck = 'update';
          } else if (method === 'DELETE') {
            actionToCheck = 'delete';
          }
        }
        
        if (!hasPermission(user, resource, actionToCheck)) {
          logger.warn('Forbidden request - insufficient permission', {
            path: event.path,
            userRole: user.role,
            resource,
            action: actionToCheck,
          });
          return {
            statusCode: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
              success: false,
              error: 'Insufficient permissions',
              message: `You do not have permission to ${actionToCheck} ${resource}`,
            }),
          };
        }
      }

      // Attach user to event for use in handler
      event.user = user;

      // Call the handler
      return handler(event, context);
    };
  };
}

module.exports = authMiddleware;

