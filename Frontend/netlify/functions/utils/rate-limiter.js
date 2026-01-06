/**
 * Rate limiting middleware for Netlify functions
 * Prevents spam and brute force attacks
 */

const logger = require('./logger');

// In-memory store for rate limiting (in production, use Redis or similar)
const rateLimitStore = new Map();

// Rate limit configurations
const RATE_LIMITS = {
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 requests per 15 minutes
  general: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  export: { maxRequests: 10, windowMs: 60 * 60 * 1000 }, // 10 requests per hour
};

/**
 * Get client identifier (IP address or user ID)
 */
function getClientId(event) {
  // Try to get IP from various headers
  return (
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['x-real-ip'] ||
    event.headers['client-ip'] ||
    event.requestContext?.identity?.sourceIp ||
    'unknown'
  );
}

/**
 * Clean up expired entries
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.expires < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limiting middleware
 */
function rateLimiter(limitType = 'general') {
  return (handler) => {
    return async (event, context) => {
      // Clean up expired entries periodically
      if (Math.random() < 0.1) { // 10% chance to cleanup
        cleanupExpiredEntries();
      }

      const limit = RATE_LIMITS[limitType] || RATE_LIMITS.general;
      const clientId = getClientId(event);
      const key = `${limitType}:${clientId}`;
      const now = Date.now();

      // Get or create rate limit entry
      let entry = rateLimitStore.get(key);

      if (!entry || entry.expires < now) {
        // Create new entry
        entry = {
          count: 1,
          expires: now + limit.windowMs,
          resetTime: now + limit.windowMs,
        };
        rateLimitStore.set(key, entry);
      } else {
        // Increment count
        entry.count++;
      }

      // Check if limit exceeded
      if (entry.count > limit.maxRequests) {
        logger.warn('Rate limit exceeded', {
          clientId,
          limitType,
          count: entry.count,
          maxRequests: limit.maxRequests,
          path: event.path,
        });

        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': limit.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
          },
          body: JSON.stringify({
            success: false,
            error: 'Too many requests. Please try again later.',
            retryAfter,
          }),
        };
      }

      // Add rate limit headers to response
      const response = await handler(event, context);
      
      if (response && response.headers) {
        response.headers['X-RateLimit-Limit'] = limit.maxRequests.toString();
        response.headers['X-RateLimit-Remaining'] = Math.max(0, limit.maxRequests - entry.count).toString();
        response.headers['X-RateLimit-Reset'] = new Date(entry.resetTime).toISOString();
      }

      return response;
    };
  };
}

module.exports = rateLimiter;

