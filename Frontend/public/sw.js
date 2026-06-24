/**
 * Service worker retired.
 * Netlify serves Clear-Site-Data: executionContexts on this URL so browsers
 * unregister legacy workers during the automatic update check (fleet-wide fix).
 */
const SW_RETIRED_VERSION = '__BUILD_VERSION__';
