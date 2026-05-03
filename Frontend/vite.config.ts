import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";
import type { ProxyOptions } from "vite";

/**
 * Dev-only: routes below forward to auth-proxy (Node) on port 3000.
 * If nothing listens there, the browser sees an opaque 500 — we log and return JSON instead.
 */
function devProxyToAuthBackend(): ProxyOptions {
  return {
    target: "http://127.0.0.1:3000",
    changeOrigin: true,
    secure: false,
    configure(proxy) {
      proxy.on("error", (err, _req, res) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Vite proxy] Cannot reach auth-proxy at :3000 (${msg}). From the Frontend folder run: npm run auth-proxy  — or use: npm run dev (starts Vite + all local proxies).`
        );
        const r = res as { headersSent?: boolean; writeHead?: (c: number, h: Record<string, string>) => void; end?: (b: string) => void };
        if (r && !r.headersSent && typeof r.writeHead === "function") {
          r.writeHead(503, { "Content-Type": "application/json" });
          r.end(
            JSON.stringify({
              success: false,
              error:
                "Development: auth-proxy is not running on port 3000. From the Frontend folder run `npm run auth-proxy`, or use `npm run dev` (starts Vite and all proxies including auth-proxy).",
            })
          );
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  // Generate build version (timestamp for each build)
  const buildVersion = Date.now().toString();
  
  return {
    esbuild: isProduction ? { drop: ["console", "debugger"] } : undefined,
    server: {
      host: "::",
      port: 8080,
      strictPort: true,
      hmr: {
        clientPort: 8080,
        host: 'localhost',
        protocol: 'ws',
      },
      proxy: {
        // Auth + Netlify-shaped routes (auth-proxy on 3000) — same-origin in dev so fetch uses port 8080
        "/api/auth": devProxyToAuthBackend(),
        // Same handler as /api/auth/session (Netlify function shape in dev)
        "/.netlify/functions/auth-session": devProxyToAuthBackend(),
        "/.netlify/functions/config-api": devProxyToAuthBackend(),
        "/.netlify/functions/metrics-api": devProxyToAuthBackend(),
        // RASCI summary served by auth-proxy (3000)
        "/api/wig/rasci/summary-by-department": devProxyToAuthBackend(),
        // Other wig APIs from wig-proxy (3003)
        '/api/wig': {
          target: 'http://127.0.0.1:3003',
          changeOrigin: true,
          secure: false,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req) => {
              const auth = req.headers.authorization;
              if (typeof auth === 'string' && auth.length > 0) {
                proxyReq.setHeader('Authorization', auth);
              }
            });
          },
        },
      },
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
          manualChunks(id) {
            if (id.includes("node_modules/mapbox-gl")) return "mapbox-gl";
            if (id.includes("node_modules/recharts")) return "recharts";
            if (id.includes("node_modules/@tanstack/react-query")) return "react-query";
          },
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
