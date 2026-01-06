/**
 * CSRF token utilities
 * Generates and validates CSRF tokens for form submissions
 */

const CSRF_TOKEN_KEY = 'csrf-token';
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a CSRF token
 */
export const generateCsrfToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  
  // Store token with expiry
  const tokenData = {
    token,
    expires: Date.now() + CSRF_TOKEN_EXPIRY,
  };
  
  sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify(tokenData));
  return token;
};

/**
 * Get current CSRF token (generate if doesn't exist or expired)
 */
export const getCsrfToken = (): string => {
  const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  if (stored) {
    try {
      const tokenData = JSON.parse(stored);
      if (tokenData.expires > Date.now()) {
        return tokenData.token;
      }
    } catch {
      // Invalid stored data, generate new token
    }
  }
  
  return generateCsrfToken();
};

/**
 * Validate CSRF token
 */
export const validateCsrfToken = (token: string): boolean => {
  const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  if (!stored) {
    return false;
  }
  
  try {
    const tokenData = JSON.parse(stored);
    
    // Check if expired
    if (tokenData.expires <= Date.now()) {
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
      return false;
    }
    
    // Check if token matches
    return tokenData.token === token;
  } catch {
    return false;
  }
};

/**
 * Clear CSRF token
 */
export const clearCsrfToken = (): void => {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
};

/**
 * Get CSRF token header for API requests
 */
export const getCsrfHeader = (): Record<string, string> => {
  return {
    'X-CSRF-Token': getCsrfToken(),
  };
};

