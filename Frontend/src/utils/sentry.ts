/**
 * Sentry Error Tracking
 * Integrates Sentry for error tracking and monitoring
 */

// Sentry is optional - only initialize if DSN is provided
let sentryInitialized = false;

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn) {
    console.log('Sentry DSN not provided, error tracking disabled');
    return;
  }

  try {
    const Sentry = await import('@sentry/react');
    
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || 'development',
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });

    sentryInitialized = true;
    console.log('Sentry initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Sentry:', error);
  }
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (!sentryInitialized) {
    console.error('Error (Sentry not initialized):', error, context);
    return;
  }

  import('@sentry/react').then((Sentry) => {
    Sentry.captureException(error, {
      contexts: {
        custom: context || {},
      },
    });
  });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!sentryInitialized) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    return;
  }

  import('@sentry/react').then((Sentry) => {
    Sentry.captureMessage(message, level);
  });
}

export function setUser(user: { id?: string; username?: string; role?: string }) {
  if (!sentryInitialized) return;

  import('@sentry/react').then((Sentry) => {
    Sentry.setUser({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  });
}

export function clearUser() {
  if (!sentryInitialized) return;

  import('@sentry/react').then((Sentry) => {
    Sentry.setUser(null);
  });
}

