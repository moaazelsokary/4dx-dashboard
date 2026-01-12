import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Generate build version (timestamp for each build)
  const buildVersion = Date.now().toString();
  
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
      // Replace build version in versionCheck.ts and serviceWorker.ts during build
      {
        name: 'replace-build-version',
        transform(code, id) {
          if (id.includes('versionCheck.ts') || id.includes('serviceWorker.ts')) {
            return code.replace(/__BUILD_VERSION__/g, buildVersion);
          }
        },
      },
      // Replace build version in service worker file
      {
        name: 'replace-sw-version',
        generateBundle() {
          const swPath = path.resolve(__dirname, 'public/sw.js');
          if (fs.existsSync(swPath)) {
            let swContent = fs.readFileSync(swPath, 'utf-8');
            swContent = swContent.replace(/__BUILD_VERSION__/g, buildVersion);
            fs.writeFileSync(swPath, swContent);
          }
        },
      },
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
        output: {
          // Ensure hash-based filenames for cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Generate manifest for version tracking
      manifest: true,
    },
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    },
  };
});
