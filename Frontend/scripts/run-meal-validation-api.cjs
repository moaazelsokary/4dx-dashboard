/**
 * Start MEAL Python validation API (local dev).
 * Requires: Python 3.11+, meal-validation/requirements.txt installed in meal-validation/.venv
 */
const { spawn, spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const MEAL_DIR = path.resolve(__dirname, '..', '..', 'meal-validation');
const PORT = Number(process.env.MEAL_VALIDATION_PORT || 8090);
const HOST = process.env.MEAL_VALIDATION_HOST || '127.0.0.1';
const API_KEY = process.env.MEAL_VALIDATION_API_KEY || 'dev-local-key';

const isWin = process.platform === 'win32';
const venvPython = path.join(
  MEAL_DIR,
  '.venv',
  isWin ? 'Scripts' : 'bin',
  isWin ? 'python.exe' : 'python'
);

function ensureVenv() {
  if (fs.existsSync(venvPython)) return;
  console.log('[MEAL API] First run — installing Python dependencies (one-time)…');
  const setup = path.join(__dirname, 'setup-meal-validation-venv.cjs');
  const r = spawnSync(process.execPath, [setup], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (r.status !== 0) {
    console.error('[MEAL API] Setup failed. Install Python 3.11+ (Windows: `py -3`) and run: npm run meal-api:setup');
    process.exit(r.status ?? 1);
  }
}

function pickPython() {
  if (fs.existsSync(venvPython)) return { cmd: venvPython, args: [] };
  if (isWin) return { cmd: 'py', args: ['-3'] };
  return { cmd: 'python3', args: [] };
}

function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`[MEAL API] Stopped old process on port ${port} (PID ${pid})`);
        } catch {
          /* ignore */
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', shell: true });
    }
  } catch {
    /* port free */
  }
}

function waitForHealth(maxMs = 45000) {
  const url = `http://${HOST}:${PORT}/health`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            if (Date.now() - start > maxMs) reject(new Error(`Health check HTTP ${res.statusCode}`));
            else setTimeout(tick, 500);
            return;
          }
          try {
            const body = JSON.parse(raw || '{}');
            if (!body.engine_version) {
              reject(
                new Error(
                  'Health OK but engine_version missing — another old API may still be running. Retry npm run proxies.'
                )
              );
              return;
            }
            resolve(body);
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', () => {
        if (Date.now() - start > maxMs) reject(new Error(`Timed out waiting for ${url}`));
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

ensureVenv();
killProcessOnPort(PORT);
const py = pickPython();
const env = {
  ...process.env,
  PORT: String(PORT),
  MEAL_VALIDATION_API_KEY: API_KEY,
  MEAL_CORS_ORIGINS: `http://localhost:8080,http://127.0.0.1:8080,http://${HOST}:${PORT}`,
};

console.log(`[MEAL API] Starting on http://${HOST}:${PORT} (${py.cmd})`);

const uvicornArgs = [
  ...py.args,
  '-m',
  'uvicorn',
  'app.main:app',
  '--host',
  HOST,
  '--port',
  String(PORT),
  '--reload',
];
const child = spawn(py.cmd, uvicornArgs, { cwd: MEAL_DIR, env, stdio: 'inherit', shell: false });

child.on('error', (err) => {
  console.error('[MEAL API] Failed to start:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

void waitForHealth()
  .then((body) =>
    console.log(
      `[MEAL API] Ready — http://${HOST}:${PORT}/health (engine ${body.engine_version})`
    )
  )
  .catch((e) => {
    console.error('[MEAL API] Health check failed:', e.message);
    process.exit(1);
  });
