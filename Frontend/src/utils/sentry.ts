/**
 * Sentry Error Tracking
 * Integrates Sentry for error tracking and monitoring
 */

// Sentry is optional - only initialize if DSN is provided
let sentryInitialized = false;

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn) {
    // Sentry is optional - silently skip if DSN not provided
    return;
  }

  // Use string variable to prevent Vite from statically analyzing the import
  const sentryPackage = '@sentry/react';
  
  try {
    // Dynamic import with string variable prevents static analysis
    const Sentry = await import(/* @vite-ignore */ sentryPackage).catch(() => {
      console.log('Sentry package not installed, error tracking disabled');
      return null;
    });
    
    if (!Sentry) {
      return;
    }
    
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

const sentryPackage = '@sentry/react';

type SentryModule = {
  captureException: (error: Error, options?: { contexts?: { custom?: Record<string, unknown> } }) => void;
  captureMessage: (message: string, level: string) => void;
  setUser: (user: { id?: string; username?: string; role?: string } | null) => void;
};

function getSentryModule(mod: unknown): SentryModule | null {
  if (!mod || typeof mod !== 'object') return null;
  const m = mod as Record<string, unknown>;
  if (typeof m.captureException !== 'function') return null;
  return mod as SentryModule;
}

export function captureException(error: Error, context?: Record<string, unknown>) {
  if (!sentryInitialized) {
    console.error('Error (Sentry not initialized):', error, context);
    return;
  }

  import(/* @vite-ignore */ sentryPackage)
    .catch(() => null)
    .then((mod) => {
      const Sentry = getSentryModule(mod);
      if (Sentry) {
        Sentry.captureException(error, {
          contexts: {
            custom: context || {},
          },
        });
      }
    });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!sentryInitialized) {
    console.log(`[${level.toUpperCase()}] ${message}`);
    return;
  }

  import(/* @vite-ignore */ sentryPackage)
    .catch(() => null)
    .then((mod) => {
      const Sentry = getSentryModule(mod);
      if (Sentry) {
        Sentry.captureMessage(message, level);
      }
    });
}

export function setUser(user: { id?: string; username?: string; role?: string }) {
  if (!sentryInitialized) return;

  import(/* @vite-ignore */ sentryPackage)
    .catch(() => null)
    .then((mod) => {
      const Sentry = getSentryModule(mod);
      if (Sentry) {
        Sentry.setUser({
          id: user.id,
          username: user.username,
          role: user.role,
        });
      }
    });
}

export function clearUser() {
  if (!sentryInitialized) return;

  import(/* @vite-ignore */ sentryPackage)
    .catch(() => null)
    .then((mod) => {
      const Sentry = getSentryModule(mod);
      if (Sentry) {
        Sentry.setUser(null);
      }
    });
}

