// Utilidades comunes a las verificaciones numéricas de js/lib/stats.js contra R.
//
// Modo de trabajo de cada test:
//   1. entradas deterministas embebidas
//   2. resultado JS (stats.js)
//   3. GOLDEN embebido = lo que devolvió R al escribir el test
//   4. se compara SIEMPRE JS vs GOLDEN (regresión sin depender de R)
//   5. si hay R + el paquete necesario: se recalcula en R y se compara
//      R vs GOLDEN (deriva) y R vs JS
//
// Así `node tests/stats/<x>.mjs` funciona con o sin R, y `run.mjs` lo aprovecha.

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ROOT, hasR, hasRPackage, rRun } from '../lib/env.mjs';

export { APP_ROOT, hasR, hasRPackage };

let _stats;
export async function stats() {
  if (!_stats) _stats = await import(APP_ROOT + '/js/lib/stats.js');
  return _stats;
}

/** conteos por muestra de datos-ejemplo/venn/genero_conteos_absolutos.csv */
export async function exampleCounts() {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(join(APP_ROOT, 'datos-ejemplo/venn/genero_conteos_absolutos.csv'), 'utf8');
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  const samples = headers.slice(1);
  const rows = lines.slice(1).map((l) => l.split(','));
  const taxa = rows.map((r) => r[0]);
  const bySample = {};
  samples.forEach((s, si) => { bySample[s] = rows.map((r) => Math.round(parseFloat(r[si + 1]) || 0)); });
  // matriz taxón × muestra
  const matrix = rows.map((r) => samples.map((_, si) => Math.round(parseFloat(r[si + 1]) || 0)));
  return { samples, taxa, bySample, matrix };
}

const maxAbs = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const maxRel = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]) / (Math.abs(b[i]) || 1)));
export { maxAbs, maxRel };

export function flat(obj) {
  // aplana {k:[...]} o [...] o número a un array de números en orden estable
  if (typeof obj === 'number') return [obj];
  if (Array.isArray(obj)) return obj.flatMap(flat);
  return Object.keys(obj).sort().flatMap((k) => flat(obj[k]));
}

/**
 * @param {object} o
 * @param {string} o.name
 * @param {number[]} o.js       resultado JS aplanado
 * @param {number[]} o.golden   referencia R embebida
 * @param {number} [o.tol=1e-9] tolerancia de error relativo
 * @param {string} [o.rPkg]     paquete R necesario para el recálculo en vivo
 * @param {() => string} [o.rScript]  script R que hace cat(jsonlite::toJSON(...))
 * @param {(rOut:any) => number[]} [o.rFlatten]  aplana la salida de R igual que js/golden
 * @returns {boolean} pasa
 */
export function verify(o) {
  const tol = o.tol ?? 1e-9;
  let ok = true;
  const rel = maxRel(o.js, o.golden);
  const abs = maxAbs(o.js, o.golden);
  console.log(`  JS vs GOLDEN(R)   n=${o.js.length}  err.rel máx ${rel.toExponential(2)}  err.abs máx ${abs.toExponential(2)}  ${rel < tol ? 'OK' : 'FALLA'}`);
  if (!(rel < tol)) ok = false;

  if (o.rScript) {
    if (o.rPkg && !hasRPackage(o.rPkg)) {
      console.log(`  R vivo: paquete «${o.rPkg}» no instalado → solo modo GOLDEN`);
    } else if (!hasR()) {
      console.log('  R vivo: Rscript no disponible → solo modo GOLDEN');
    } else {
      try {
        const raw = rRun(o.rScript()).trim();
        const start = Math.min(...['{', '['].map((c) => { const i = raw.indexOf(c); return i < 0 ? Infinity : i; }));
        const rOut = JSON.parse(start === Infinity ? raw : raw.slice(start));
        const rFlat = o.rFlatten ? o.rFlatten(rOut) : flat(rOut);
        const rvG = maxRel(rFlat, o.golden);
        const rvJ = maxRel(rFlat, o.js);
        console.log(`  R(vivo) vs GOLDEN  err.rel máx ${rvG.toExponential(2)}  ${rvG < tol ? 'OK' : 'FALLA (¿deriva?)'}`);
        console.log(`  R(vivo) vs JS      err.rel máx ${rvJ.toExponential(2)}  ${rvJ < tol ? 'OK' : 'FALLA'}`);
        if (!(rvG < tol) || !(rvJ < tol)) ok = false;
      } catch (e) {
        console.log('  R vivo: falló la ejecución → solo modo GOLDEN (' + (e.message || e).toString().split('\n')[0] + ')');
      }
    }
  }
  return ok;
}

export function tmp(name, content) {
  const p = join(tmpdir(), 'qlstats-' + name);
  writeFileSync(p, content);
  return p;
}

export function done(label, ok) {
  console.log('\nRESULTADO ' + label + ': ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
}
