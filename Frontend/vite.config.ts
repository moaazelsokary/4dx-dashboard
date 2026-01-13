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
      // Replace build version in service worker file during build
      {
        name: 'replace-sw-version',
        buildStart() {
          // Replace version in source file before build (Vite copies public/ to dist/)
          const swPath = path.resolve(__dirname, 'public/sw.js');
          if (fs.existsSync(swPath)) {
            let swContent = fs.readFileSync(swPath, 'utf-8');
            swContent = swContent.replace(/__BUILD_VERSION__/g, buildVersion);
            fs.writeFileSync(swPath, swContent);
          }
        },
        closeBundle() {
          // After build completes, ensure version is replaced in dist/sw.js
          const distSwPath = path.resolve(__dirname, 'dist/sw.js');
          if (fs.existsSync(distSwPath)) {
            let swContent = fs.readFileSync(distSwPath, 'utf-8');
            swContent = swContent.replace(/__BUILD_VERSION__/g, buildVersion);
            fs.writeFileSync(distSwPath, swContent);
          }
          
          // Also add build version to index.html meta tag
          const distHtmlPath = path.resolve(__dirname, 'dist/index.html');
          if (fs.existsSync(distHtmlPath)) {
            let htmlContent = fs.readFileSync(distHtmlPath, 'utf-8');
            // Add or update meta tag with build version
            if (htmlContent.includes('name="build-version"')) {
              htmlContent = htmlContent.replace(
                /<meta\s+name="build-version"\s+content="[^"]*"/i,
                `<meta name="build-version" content="${buildVersion}"`
              );
            } else {
              // Insert meta tag in head
              htmlContent = htmlContent.replace(
                /<head>/i,
                `<head>\n    <meta name="build-version" content="${buildVersion}">`
              );
            }
            fs.writeFileSync(distHtmlPath, htmlContent);
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
