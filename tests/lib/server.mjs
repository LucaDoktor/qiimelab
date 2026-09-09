// Servidor HTTP estático para los tests de navegador. Si ya hay uno sirviendo
// la app en el puerto, lo reutiliza; si no, arranca `python3 -m http.server`
// sobre la raíz del repo y lo para al terminar.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { APP_ROOT } from './env.mjs';

const PORT = Number(process.env.QL_TEST_PORT || 8931);
const BASE = `http://127.0.0.1:${PORT}`;

async function reachable() {
  try {
    const r = await fetch(BASE + '/index.html', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

/**
 * @returns {Promise<{ url: string, started: boolean, stop: () => void } | null>}
 *   null si no se puede servir la app (no hay python3 y no había servidor).
 */
export async function ensureServer() {
  if (await reachable()) return { url: BASE, started: false, stop() {} };

  let proc;
  try {
    proc = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
      { cwd: APP_ROOT, stdio: 'ignore' });
  } catch { return null; }

  for (let i = 0; i < 50; i++) {
    await sleep(200);
    if (await reachable()) {
      return {
        url: BASE, started: true,
        stop() { try { proc.kill('SIGKILL'); } catch { /* noop */ } },
      };
    }
    if (proc.exitCode != null) return null;
  }
  try { proc.kill('SIGKILL'); } catch { /* noop */ }
  return null;
}
