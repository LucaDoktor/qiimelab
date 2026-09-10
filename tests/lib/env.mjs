// Detección de entorno: Chrome/Chromium, R y paquetes de R.
// Los tests se saltan (exit 2) con elegancia cuando falta algo, en vez de
// romper el runner.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const APP_ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
export { APP_ROOT };

let _chrome;
export function findChrome() {
  if (_chrome !== undefined) return _chrome;
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  _chrome = candidates.find((p) => { try { return existsSync(p); } catch { return false; } }) || null;
  if (!_chrome) {
    for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
      try { _chrome = execSync('command -v ' + name, { encoding: 'utf8' }).trim() || null; if (_chrome) break; } catch { /* noop */ }
    }
  }
  return _chrome;
}

let _r;
export function hasR() {
  if (_r !== undefined) return _r;
  try { execFileSync('Rscript', ['--version'], { stdio: 'ignore' }); _r = true; }
  catch { _r = false; }
  return _r;
}

const _pkgCache = new Map();
export function hasRPackage(pkg) {
  if (!hasR()) return false;
  if (_pkgCache.has(pkg)) return _pkgCache.get(pkg);
  let ok = false;
  try {
    const out = execFileSync('Rscript', ['-e', `cat(requireNamespace(${JSON.stringify(pkg)}, quietly=TRUE))`], { encoding: 'utf8' });
    ok = out.trim() === 'TRUE';
  } catch { ok = false; }
  _pkgCache.set(pkg, ok);
  return ok;
}

/** Ejecuta un script de R y devuelve su stdout (string). Lanza si R falla.
 *  stderr (warnings de R) se descarta. */
export function rRun(script) {
  return execFileSync('Rscript', ['-e', script], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Ejecuta R y parsea su stdout como JSON (el script debe hacer cat(toJSON(...))). */
export function rJson(script) {
  const out = rRun(script).trim();
  // por si R imprime warnings antes del JSON, quédate con el último bloque {...} o [...]
  const start = Math.min(...['{', '['].map((c) => { const i = out.indexOf(c); return i < 0 ? Infinity : i; }));
  return JSON.parse(start === Infinity ? out : out.slice(start));
}

let _py;
export function hasPython() {
  if (_py !== undefined) return _py;
  try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); _py = true; }
  catch { _py = false; }
  return _py;
}

let _biopython;
export function hasBiopython() {
  if (!hasPython()) return false;
  if (_biopython !== undefined) return _biopython;
  try {
    execFileSync('python3', ['-c', 'import Bio'], { stdio: 'ignore' });
    _biopython = true;
  } catch { _biopython = false; }
  return _biopython;
}

/** Ejecuta un script de Python 3 y devuelve su stdout (string). */
export function pyRun(script) {
  return execFileSync('python3', ['-c', script], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export const SKIP = 2;
export function skip(msg) { console.log('SKIP: ' + msg); process.exit(SKIP); }
