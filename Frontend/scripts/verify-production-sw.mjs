/**
 * Diagnose production availability and service-worker recovery.
 * Run: npm run verify:production
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PRODUCTION_HOST = process.env.PRODUCTION_HOST || 'lifemakers.netlify.app';
const PRODUCTION_URL = process.env.PRODUCTION_URL || `https://${PRODUCTION_HOST}/`;

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
<title>SW test</title></head><body><h1>OK</h1></body></html>`;

async function timedFetch(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    const text = await res.text();
    return {
      ok: true,
      status: res.status,
      clearSiteData: res.headers.get('clear-site-data'),
      bodyStart: text.slice(0, 160),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function checkDns() {
  try {
    const records = await dns.lookup(PRODUCTION_HOST, { all: true });
    return { ok: true, records };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkCurlHead() {
  try {
    const { stdout } = await execFileAsync('curl.exe', [
      '-4', '-sI', '--max-time', '15',
      `https://${PRODUCTION_HOST}/sw.js`,
    ], { timeout: 20000 });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const status = lines[0] || '';
    const clearSiteData = lines.find((l) => l.toLowerCase().startsWith('clear-site-data:')) || null;
    return { ok: true, status, clearSiteData, raw: lines.slice(0, 12) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProductionBrowser() {
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
        scriptUrl: navigator.serviceWorker.controller?.scriptURL || null,
      };
    });
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
        ...(swMode === 'retired' ? { 'Clear-Site-Data': '"executionContexts"' } : {}),
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

function summarize(network, browser) {
  const lines = [];

  if (!network.homepage?.ok || !network.sw?.ok) {
    lines.push('NETWORK BLOCKED: This PC cannot reach Netlify (HTTPS timeout).');
    lines.push('The old service worker turns that into a fake 503 page.');
    lines.push('Ask IT to allow HTTPS to lifemakers.netlify.app (and *.netlify.app for APIs).');
    lines.push('Until then, no deploy fix will help from office networks.');
  } else if (network.sw.clearSiteData?.includes('executionContexts')) {
    lines.push('Server fix is deployed (Clear-Site-Data on /sw.js).');
  } else {
    lines.push('Server reachable but Clear-Site-Data header missing on /sw.js — deploy latest build.');
  }

  if (browser.error?.includes('ERR_CONNECTION_TIMED_OUT') || !network.homepage?.ok) {
    lines.push('On each stuck device: Edge → F12 → Application → Storage → Clear site data (once).');
    lines.push('After IT unblocks Netlify, the site should load without manual steps.');
  } else if (browser.sw?.scriptUrl && !browser.sw.scriptUrl.includes('SW_RETIRED')) {
    lines.push('Browser still runs an OLD service worker script — clear site data once.');
  } else if (browser.hasSignIn) {
    lines.push('Production looks healthy from this machine.');
  }

  return lines;
}

const dnsResult = await checkDns();
const curlResult = await checkCurlHead();
const homepage = await timedFetch(PRODUCTION_URL);
const sw = await timedFetch(`https://${PRODUCTION_HOST}/sw.js`);
const browser = await testProductionBrowser();
const local = await testLocalClearSiteDataFix();

const report = {
  host: PRODUCTION_HOST,
  dns: dnsResult,
  curl: curlResult,
  network: { homepage, sw },
  browser,
  localSimulation: local,
  summary: summarize({ homepage, sw }, browser),
};

console.log(JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
for (const line of report.summary) {
  console.log(`- ${line}`);
}

process.exitCode =
  report.summary.some((l) => l.startsWith('NETWORK BLOCKED')) ? 2 :
  report.summary.some((l) => l.includes('clear site data') || l.includes('OLD service worker')) ? 1 :
  0;
