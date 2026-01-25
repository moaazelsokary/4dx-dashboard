/**
 * User-Friendly Error Messages
 * Maps technical errors to user-friendly, actionable messages
 */

export interface ErrorMessage {
  title: string;
  description: string;
  action?: string;
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyError(error: {
  message?: string;
  status?: number;
  isAuthError?: boolean;
  isNetworkError?: boolean;
}): ErrorMessage {
  // Authentication errors
  if (error.isAuthError) {
    return {
      title: 'Session Expired',
      description: 'Your session has expired. Please sign in again.',
      action: 'Redirecting to sign-in...',
    };
  }

  // Network errors
  if (error.isNetworkError) {
    return {
      title: 'Connection Problem',
      description: 'Unable to connect to the server. Please check your internet connection.',
      action: 'Retrying...',
    };
  }

  // Status code based messages
  if (error.status) {
    switch (error.status) {
      case 400:
        return {
          title: 'Invalid Request',
          description: error.message || 'The request was invalid. Please check your input and try again.',
        };
      case 404:
        return {
          title: 'Not Found',
          description: 'The requested resource was not found.',
        };
      case 408:
        return {
          title: 'Request Timeout',
          description: 'The request took too long. Please check your connection and try again.',
          action: 'Retrying...',
        };
      case 429:
        return {
          title: 'Too Many Requests',
          description: 'You are making requests too quickly. Please wait a moment and try again.',
          action: 'Waiting...',
        };
      case 500:
        return {
          title: 'Server Error',
          description: 'The server encountered an error. Please try again in a moment.',
          action: 'Retrying...',
        };
      case 502:
      case 503:
      case 504:
        return {
          title: 'Service Unavailable',
          description: 'The service is temporarily unavailable. Please try again in a moment.',
          action: 'Retrying...',
        };
      default:
        if (error.status >= 500) {
          return {
            title: 'Server Error',
            description: 'The server encountered an error. Please try again later.',
            action: 'Retrying...',
          };
        }
    }
  }

  // Message-based detection
  const message = (error.message || '').toLowerCase();
  
  if (message.includes('timeout')) {
    return {
      title: 'Request Timeout',
      description: 'The request took too long to complete. Please check your connection and try again.',
      action: 'Retrying...',
    };
  }

  if (message.includes('fetch')) {
    return {
      title: 'Connection Failed',
      description: 'Unable to reach the server. Please check your internet connection.',
      action: 'Retrying...',
    };
  }

  if (message.includes('locked') || message.includes('lock')) {
    return {
      title: 'Operation Locked',
      description: error.message || 'This operation is locked and cannot be performed.',
    };
  }

  // Default message
  return {
    title: 'Error',
    description: error.message || 'An unexpected error occurred. Please try again.',
  };
}

/**
 * Get retry suggestion message
 */
export function getRetryMessage(attempt: number, maxRetries: number): string {
  if (attempt >= maxRetries) {
    return 'Maximum retry attempts reached. Please try again later.';
  }
  return `Retrying... (${attempt + 1}/${maxRetries})`;
}
