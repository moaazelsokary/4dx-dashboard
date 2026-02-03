import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { getCsrfToken } from './utils/csrf'
import { initSentry } from './utils/sentry'
import { initVersionCheck } from './utils/versionCheck'
import { registerServiceWorker } from './utils/serviceWorker'
import { installScrollWheelCapture } from './lib/scrollWheelCapture'

// Initialize CSRF token on app load
getCsrfToken();

// Ensure wheel/trackpad scroll works in dropdowns and filters (runs before any other listener)
installScrollWheelCapture();

// Initialize Sentry error tracking (optional)
initSentry().catch(console.error);

// Initialize version checking to ensure users get latest version
initVersionCheck();

// Register service worker for automatic updates
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
