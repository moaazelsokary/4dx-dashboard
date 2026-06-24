/**
 * Verify production site loads and legacy service worker is cleared.
 * Run: node scripts/verify-production-sw.mjs
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://lifemakers.netlify.app/';

const OLD_BROKEN_SW = `
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.get('accept')?.includes('text/html') || request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cached = await caches.match(request);
        if (!cached) {
          return new Response('Network error and no cache available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return cached;
      }),
    );
  }
});
`;

const RETIRED_SW = `// retired\nconst SW_RETIRED_VERSION = 'test';\n`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SW test</title>
<script>
  if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister())));
  }
</script>
</head><body><h1>OK</h1></body></html>`;

async function testProduction() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const result = { url: PRODUCTION_URL };
  try {
    const response = await page.goto(PRODUCTION_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    result.status = response?.status() ?? null;
    result.title = await page.title();
    result.hasSignIn = (await page.getByText('Sign In').count()) > 0;
    result.bodySnippet = (await page.content()).slice(0, 200);
    result.sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        count: regs.length,
        controller: !!navigator.serviceWorker.controller,
      };
    });

    const reload = await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    result.reloadStatus = reload?.status() ?? null;
    result.reloadTitle = await page.title();
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close();
  }
  return result;
}

async function testLocalClearSiteDataFix() {
  let swMode = 'broken';
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/sw.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...(swMode === 'retired'
          ? { 'Clear-Site-Data': '"executionContexts"' }
          : {}),
      });
      res.end(swMode === 'broken' ? OLD_BROKEN_SW : RETIRED_SW);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const result = { base };

  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForTimeout(300);

    await context.setOffline(true);
    const broken = await page.goto(base, { waitUntil: 'domcontentloaded' });
    result.brokenStatus = broken?.status() ?? null;
    result.brokenText = await page.evaluate(() => document.body?.innerText || '');

    await context.setOffline(false);
    swMode = 'retired';
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    });
    await page.waitForTimeout(500);

    const recovered = await page.goto(base, { waitUntil: 'domcontentloaded' });
    result.recoveredStatus = recovered?.status() ?? null;
    result.recoveredText = await page.evaluate(() => document.body?.innerText || '');
    result.swAfter = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return { count: regs.length, controller: !!navigator.serviceWorker.controller };
    });
    result.passed =
      result.brokenStatus === 503 &&
      result.brokenText.includes('Network error and no cache available') &&
      result.recoveredStatus === 200 &&
      result.recoveredText.includes('OK') &&
      result.swAfter.count === 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close();
    server.close();
  }

  return result;
}

async function checkProductionSwHeaders() {
  const res = await fetch('https://lifemakers.netlify.app/sw.js', { cache: 'no-store' });
  return {
    status: res.status,
    clearSiteData: res.headers.get('clear-site-data'),
    bodyStart: (await res.text()).slice(0, 120),
  };
}

console.log('=== Production fetch (sw.js headers) ===');
try {
  console.log(await checkProductionSwHeaders());
} catch (error) {
  console.log({ error: String(error) });
}

console.log('\n=== Production browser test ===');
console.log(await testProduction());

console.log('\n=== Local Clear-Site-Data simulation ===');
console.log(await testLocalClearSiteDataFix());
