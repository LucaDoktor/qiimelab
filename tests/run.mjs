// Runner único: ejecuta todos los tests de tests/ y resume pasa/falla/salta.
//
//   node tests/run.mjs                 → todo
//   node tests/run.mjs stats           → solo tests/stats/*
//   node tests/run.mjs sweep-routes contrast   → solo esos
//
// Cada test sale con 0 (pasa), 1 (falla) o 2 (se salta: falta Chrome / R / …).
// El runner sale != 0 si algún test falla (los saltados no cuentan como fallo).

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findChrome, hasR } from './lib/env.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));

const SUITE = [
  { name: 'privacy', file: 'privacy.mjs', kind: 'estático' },
  { name: 'contrast', file: 'contrast.mjs', kind: 'estático' },
  { name: 'cvd', file: 'cvd.mjs', kind: 'estático' },
  { name: 'forcelayout', file: 'forcelayout.mjs', kind: 'estático' },
  { name: 'datahealth', file: 'datahealth.mjs', kind: 'estático' },
  { name: 'stats/diversity', file: 'stats/diversity.mjs', kind: 'R' },
  { name: 'stats/rarefaction', file: 'stats/rarefaction.mjs', kind: 'R' },
  { name: 'stats/richness', file: 'stats/richness.mjs', kind: 'R' },
  { name: 'stats/kruskalwallis', file: 'stats/kruskalwallis.mjs', kind: 'R' },
  { name: 'stats/correlation', file: 'stats/correlation.mjs', kind: 'R' },
  { name: 'stats/incompletebeta', file: 'stats/incompletebeta.mjs', kind: 'R' },
  { name: 'stats/chisquare', file: 'stats/chisquare.mjs', kind: 'R' },
  { name: 'stats/benjaminihochberg', file: 'stats/benjaminihochberg.mjs', kind: 'R' },
  { name: 'stats/cliffsdelta', file: 'stats/cliffsdelta.mjs', kind: 'R' },
  { name: 'stats/countsummary', file: 'stats/countsummary.mjs', kind: 'R' },
  { name: 'stats/permanova', file: 'stats/permanova.mjs', kind: 'R' },
  { name: 'keyboard-editor', file: 'keyboard-editor.mjs', kind: 'navegador' },
  { name: 'session-ui', file: 'session-ui.mjs', kind: 'navegador' },
  { name: 'compare-overlap', file: 'compare-overlap.mjs', kind: 'navegador' },
  { name: 'sweep-a11y', file: 'sweep-a11y.mjs', kind: 'navegador' },
  { name: 'sweep-session', file: 'sweep-session.mjs', kind: 'navegador' },
  { name: 'sweep-routes', file: 'sweep-routes.mjs', kind: 'navegador' },
  { name: 'mobile-audit', file: 'mobile-audit.mjs', kind: 'navegador' },
  { name: 'pwa', file: 'pwa.mjs', kind: 'navegador' },
  { name: 'perf-stress', file: 'perf-stress.mjs', kind: 'navegador' },
];

const filters = process.argv.slice(2);
const picked = filters.length
  ? SUITE.filter((s) => filters.some((f) => s.name === f || s.name.startsWith(f + '/') || s.file === f || s.name.startsWith(f)))
  : SUITE;

// avisos de entorno
if (!findChrome()) console.log('· sin Chrome/Chromium → los tests de navegador se SALTAN\n');
if (!hasR()) console.log('· sin Rscript → los tests de stats corren en modo GOLDEN (referencia R embebida)\n');

function runOne(spec) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(process.execPath, [join(DIR, spec.file)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      resolve({ spec, code, secs, out });
    });
  });
}

const results = [];
for (const spec of picked) {
  process.stdout.write(`\n${'━'.repeat(70)}\n▶ ${spec.name}  (${spec.kind})\n${'━'.repeat(70)}\n`);
  const r = await runOne(spec);
  process.stdout.write(r.out.trimEnd() + '\n');
  results.push(r);
}

const mark = { 0: 'PASA ', 1: 'FALLA', 2: 'salta' };
console.log('\n\n' + '═'.repeat(70));
console.log('RESUMEN');
console.log('═'.repeat(70));
let fails = 0, skips = 0;
for (const r of results) {
  if (r.code === 1) fails++;
  if (r.code === 2) skips++;
  console.log(`  ${mark[r.code] ?? 'ERR ' + r.code}  ${r.spec.name.padEnd(28)} ${r.secs.padStart(5)}s`);
}
console.log('─'.repeat(70));
console.log(`  ${results.length} tests · ${results.length - fails - skips} pasan · ${fails} fallan · ${skips} saltados`);
process.exit(fails ? 1 : 0);
