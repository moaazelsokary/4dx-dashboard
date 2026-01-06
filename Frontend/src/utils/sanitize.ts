/**
 * Input sanitization utilities
 * Protects against XSS attacks by sanitizing user input
 */

// For now, we'll use a simple sanitization approach
// In production, consider using DOMPurify library
export const sanitizeHtml = (dirty: string): string => {
  // Remove script tags and event handlers
  return dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');
};

/**
 * Sanitize text input (remove HTML tags)
 */
export const sanitizeText = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Sanitize URL
 */
export const sanitizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    // Only allow http, https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
    return '';
  } catch {
    return '';
  }
};

/**
 * Escape HTML special characters
 */
export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

