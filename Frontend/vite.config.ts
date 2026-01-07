import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      external: (id) => {
        // Make Sentry optional - don't bundle it if not installed
        if (id === '@sentry/react' || id.startsWith('@sentry/')) {
          try {
            require.resolve(id);
            return false; // Bundle if installed
          } catch {
            return true; // External if not installed
          }
        }
        return false;
      },
    },
  },
}));
