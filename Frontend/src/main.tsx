import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { getCsrfToken } from './utils/csrf'
import { initSentry } from './utils/sentry'

// Initialize CSRF token on app load
getCsrfToken();

// Initialize Sentry error tracking (optional)
initSentry().catch(console.error);

createRoot(document.getElementById("root")!).render(<App />);
