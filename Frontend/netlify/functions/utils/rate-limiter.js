/**
 * Rate limiting middleware for Netlify functions
 * Prevents abuse and brute-force attacks
 */

// In-memory store for rate limiting (in production, consider using Redis)
const rateLimitStore = new Map();

// Rate limit configurations
const RATE_LIMITS = {
  login: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  general: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  export: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
};

/**
 * Get client identifier from request
 */
function getClientId(event) {
  // Try to get IP from headers (Netlify provides this)
  const ip = event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             event.headers['x-nf-client-connection-ip'] ||
             event.requestContext?.identity?.sourceIp ||
             'unknown';
  return ip;
}

/**
 * Clean up old entries from rate limit store
 */
function cleanupStore() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.expiresAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limiter middleware factory
 */
function rateLimiter(type = 'general') {
  const config = RATE_LIMITS[type] || RATE_LIMITS.general;

  return (handler) => {
    return async (event, context) => {
      // Clean up old entries periodically
      if (Math.random() < 0.1) { // 10% chance to cleanup
        cleanupStore();
      }

      const clientId = getClientId(event);
      const key = `${type}:${clientId}`;
      const now = Date.now();

      // Get or create rate limit entry
      let entry = rateLimitStore.get(key);
      
      if (!entry || entry.expiresAt < now) {
        // Create new entry
        entry = {
          count: 0,
          expiresAt: now + config.windowMs,
        };
        rateLimitStore.set(key, entry);
      }

      // Check if limit exceeded
      if (entry.count >= config.maxRequests) {
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((entry.expiresAt - now) / 1000),
          },
          body: JSON.stringify({
            error: 'Too many requests',
            message: `Rate limit exceeded. Please try again after ${Math.ceil((entry.expiresAt - now) / 1000)} seconds.`,
          }),
        };
      }

      // Increment counter
      entry.count++;

      // Call the handler
      try {
        const response = await handler(event, context);
        return response;
      } catch (error) {
        // Still count failed requests
        throw error;
      }
    };
  };
}

module.exports = rateLimiter;

