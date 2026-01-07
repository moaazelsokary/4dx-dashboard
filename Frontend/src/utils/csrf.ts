/**
 * CSRF Token Management
 * Generates and manages CSRF tokens for form submissions
 */

const CSRF_TOKEN_KEY = 'csrf-token';

/**
 * Generate a random CSRF token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create CSRF token
 * Stores token in localStorage for persistence across page reloads
 */
export function getCsrfToken(): string {
  let token = localStorage.getItem(CSRF_TOKEN_KEY);
  
  if (!token) {
    token = generateToken();
    localStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  
  return token;
}

/**
 * Refresh CSRF token (generate new one)
 */
export function refreshCsrfToken(): string {
  const token = generateToken();
  localStorage.setItem(CSRF_TOKEN_KEY, token);
  return token;
}

/**
 * Clear CSRF token (e.g., on logout)
 */
export function clearCsrfToken(): void {
  localStorage.removeItem(CSRF_TOKEN_KEY);
}

/**
 * Get CSRF token for use in headers
 */
export function getCsrfHeader(): { 'X-CSRF-Token': string } {
  return {
    'X-CSRF-Token': getCsrfToken(),
  };
}

