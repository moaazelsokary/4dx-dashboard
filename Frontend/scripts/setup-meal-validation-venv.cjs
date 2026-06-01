/**
 * One-time setup: create meal-validation/.venv and install requirements.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const MEAL_DIR = path.resolve(__dirname, '..', '..', 'meal-validation');
const isWin = process.platform === 'win32';
const venvDir = path.join(MEAL_DIR, '.venv');
const venvPython = path.join(MEAL_DIR, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
const venvPip = path.join(MEAL_DIR, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'pip.exe' : 'pip');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: opts.cwd || MEAL_DIR, shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(venvDir)) {
  console.log('[MEAL setup] Creating virtual environment…');
  if (isWin) run('py', ['-3', '-m', 'venv', '.venv']);
  else run('python3', ['-m', 'venv', '.venv']);
}

console.log('[MEAL setup] Installing requirements…');
run(venvPip, ['install', '-r', 'requirements.txt']);

console.log('[MEAL setup] Verifying import…');
run(venvPython, [
  '-c',
  "import sys; sys.path.insert(0,'vendor'); from volunteer_upload_validation import validate_volunteer_upload; print('OK')",
]);

console.log('[MEAL setup] Done. Run: npm run meal-api');
