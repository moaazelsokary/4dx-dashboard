/**
 * Dev helper: wait until auth-proxy accepts TCP on 127.0.0.1:3000, then spawn Vite.
 * Avoids sign-in 503 when Vite becomes ready before auth-proxy finishes booting.
 */
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 3000;
const POLL_MS = 250;
const MAX_ATTEMPTS = 240; // ~60s
/** Log a reminder every N poll attempts (~10s at 250ms) */
const LOG_EVERY_ATTEMPTS = 40;

const root = path.join(__dirname, '..');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

console.log(
  '[dev] Waiting for auth-proxy at http://%s:%s …\n' +
    '      If this sits here: run `npm run proxies` in another terminal, or `npm run dev:all` for one terminal.',
  HOST,
  PORT
);

function tryConnect(attempt, onReady, onGiveUp) {
  const socket = net.createConnection({ port: PORT, host: HOST, timeout: 2000 });
  socket.on('connect', () => {
    socket.end();
    onReady();
  });
  socket.on('error', () => {
    socket.destroy();
    if (attempt >= MAX_ATTEMPTS) {
      onGiveUp();
      return;
    }
    if (attempt > 0 && attempt % LOG_EVERY_ATTEMPTS === 0) {
      const sec = Math.round((attempt * POLL_MS) / 1000);
      console.log('[dev] Still waiting (%ds) — start `npm run proxies` or use `npm run dev:all`.', sec);
    }
    setTimeout(() => tryConnect(attempt + 1, onReady, onGiveUp), POLL_MS);
  });
}

tryConnect(
  0,
  () => {
    console.log('[dev] auth-proxy is up — starting Vite (http://localhost:8080) …\n');
    const child = spawn(process.execPath, [viteCli], {
      stdio: 'inherit',
      cwd: root,
      env: process.env,
    });
    child.on('exit', (code, signal) => {
      if (signal) process.exit(1);
      process.exit(code == null ? 0 : code);
    });
  },
  () => {
    console.error(
      `[dev] Timed out waiting for auth-proxy on http://${HOST}:${PORT}.\n` +
        '  From the Frontend folder: terminal 1 → `npm run proxies`  then  terminal 2 → `npm run dev`.\n' +
        '  Or one terminal: `npm run dev:all` (starts proxies + Vite).'
    );
    process.exit(1);
  }
);
