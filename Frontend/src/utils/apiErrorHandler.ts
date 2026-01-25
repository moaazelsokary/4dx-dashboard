/**
 * Centralized API Error Handler
 * Handles API errors consistently across the application
 */

export interface ApiError {
  message: string;
  status?: number;
  isAuthError: boolean;
  isNetworkError: boolean;
  shouldRetry: boolean;
  retryAfter?: number;
}

/**
 * Check if error is authentication-related (401, 403)
 */
export function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * Check if error is network-related
 */
export function isNetworkError(error: Error | unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors typically throw TypeError
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network request failed') ||
      message.includes('load failed')
    );
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline')
    );
  }
  
  return false;
}

/**
 * Determine if request should be retried
 */
export function shouldRetry(error: ApiError, attempt: number, maxRetries: number = 3): boolean {
  if (attempt >= maxRetries) {
    return false;
  }
  
  // Don't retry auth errors
  if (error.isAuthError) {
    return false;
  }
  
  // Retry network errors and 5xx server errors
  if (error.isNetworkError || (error.status && error.status >= 500)) {
    return true;
  }
  
  // Retry 429 (rate limit) if retryAfter is provided
  if (error.status === 429 && error.retryAfter) {
    return true;
  }
  
  return false;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Handle API error and return structured error object
 */
export async function handleApiError(
  error: Error | unknown,
  response?: Response
): Promise<ApiError> {
  let status: number | undefined;
  let errorMessage = 'An unexpected error occurred';
  let retryAfter: number | undefined;

  // Extract status from response
  if (response) {
    status = response.status;
    
    // Try to parse error message from response
    try {
      const errorData = await response.json().catch(() => ({}));
      errorMessage = errorData.error || errorData.message || response.statusText || errorMessage;
      
      // Extract Retry-After header for rate limiting
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader) {
        retryAfter = parseInt(retryAfterHeader, 10);
      }
    } catch {
      // If response is not JSON, try to get text
      try {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      } catch {
        errorMessage = response.statusText || errorMessage;
      }
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
    // Try to extract status from error if it has one
    if ('status' in error && typeof (error as any).status === 'number') {
      status = (error as any).status;
    }
  }

  const isAuth = status ? isAuthError(status) : false;
  const isNetwork = isNetworkError(error);

  return {
    message: errorMessage,
    status,
    isAuthError: isAuth,
    isNetworkError: isNetwork,
    shouldRetry: false, // Will be determined by shouldRetry() function
    retryAfter,
  };
}

/**
 * Handle authentication error - sign out and redirect
 */
export function handleAuthError(): void {
  // Import dynamically to avoid circular dependencies
  import('@/services/authService').then(({ signOut }) => {
    // Show brief message before redirect
    import('@/hooks/use-toast').then(({ toast }) => {
      toast({
        title: 'Session Expired',
        description: 'Your session has expired. Please sign in again.',
        variant: 'destructive',
      });
    });
    
    // Sign out (which will redirect)
    signOut(true);
  });
}
