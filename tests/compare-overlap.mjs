// Vista "Comparar varias" de abundancia diferencial: recalcula el solapamiento
// de significativos (padj < 0.05) DIRECTAMENTE desde los 3 CSV de
// datos-ejemplo/abundancia-diferencial/ y lo compara con lo que pinta la UI
// (regiones del diagrama de Venn + histograma "significativo en N de M").
//
//   node tests/compare-overlap.mjs

import { readFileSync } from 'node:fs';
import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip, APP_ROOT } from './lib/env.mjs';
import { sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

const DE = APP_ROOT + '/datos-ejemplo/abundancia-diferencial';
const FILES = ['DESeq2_D_vs_Control.csv', 'DESeq2_D_vs_N.csv', 'DESeq2_N_vs_Control.csv'];
const PADJ = 0.05;

// --- recálculo directo desde los CSV ---
const sigSet = (file) => {
  const lines = readFileSync(DE + '/' + file, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const gi = head.indexOf('Genus'), pi = head.indexOf('padj');
  const s = new Set();
  lines.slice(1).forEach((ln) => {
    const c = ln.split(',');
    const padj = parseFloat(c[pi]);
    if (isFinite(padj) && padj >= 0 && padj < PADJ) s.add(c[gi].trim());
  });
  return s;
};
const sets = FILES.map(sigSet);
const universe = new Set();
sets.forEach((s) => s.forEach((x) => universe.add(x)));
const byMask = {};
universe.forEach((x) => {
  let mask = 0;
  sets.forEach((s, i) => { if (s.has(x)) mask |= (1 << i); });
  (byMask[mask] = byMask[mask] || 0) + 0;
  byMask[mask] = (byMask[mask] || 0) + 1;
});
const hist = {};
universe.forEach((x) => { const n = sets.filter((s) => s.has(x)).length; hist[n] = (hist[n] || 0) + 1; });

console.log('CSV: significativos', sets.map((s, i) => FILES[i].replace(/DESeq2_|\.csv/g, '') + '=' + s.size).join(', '));
console.log('CSV: por máscara', JSON.stringify(byMask), '· histograma', JSON.stringify(hist), '· universo', universe.size);

// --- UI ---
const c = await connect({ url: server.url + '/index.html', label: 'compare-overlap' });
let failed = false;
const check = (name, ok, extra = '') => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!ok) failed = true; };

try {
  await c.goto();
  await sleep(1500);
  await c.ev(`(async () => { const m = await import('/js/lib/exampleData.js'); await m.loadRealDiffComparisons(); })()`);
  await sleep(2500);
  await c.ev(`location.hash = '#/diferencial'`);
  await sleep(1400);
  await c.ev(`(() => { const b = [...document.querySelectorAll('.ql-tab')].find(x => /Comparar/.test(x.textContent)); b.click(); })()`);
  await sleep(1600);

  const ui = await c.ev(`(() => {
    const regions = {};
    document.querySelectorAll('.ql-chartwrap .vn-region').forEach((g) => {
      const m = g.getAttribute('data-mask'); const t = g.querySelector('text');
      if (m && t) regions[m] = parseInt(t.textContent, 10);
    });
    const hist = {}; let entities = 0;
    document.querySelectorAll('.ql-table tbody tr').forEach((tr) => {
      const last = tr.children[tr.children.length - 1];
      const m = last && /(\\d+)\\s*\\/\\s*(\\d+)/.exec(last.textContent);
      if (m) { entities++; hist[m[1]] = (hist[m[1]] || 0) + 1; }
    });
    return { regions, hist, entities, comparisons: [...document.querySelectorAll('.ql-cmp-label')].map((i) => i.value) };
  })()`);
  console.log('UI: comparaciones', JSON.stringify(ui.comparisons));
  console.log('UI: regiones', JSON.stringify(ui.regions), '· histograma', JSON.stringify(ui.hist), '· entidades', ui.entities);

  let maskOk = true;
  for (let m = 1; m <= 7; m++) if ((byMask[m] || 0) !== (ui.regions[m] || 0)) { maskOk = false; console.log(`  máscara ${m}: csv=${byMask[m] || 0} ui=${ui.regions[m] || 0}`); }
  check('regiones del diagrama de Venn == recálculo desde CSV', maskOk);

  delete ui.hist['0']; // la UI filtra la tabla a "significativo en ≥1"
  check('histograma "sig en N de M" == recálculo', JSON.stringify(hist) === JSON.stringify(ui.hist), `csv ${JSON.stringify(hist)} vs ui ${JSON.stringify(ui.hist)}`);
  check('nº de entidades de la tabla == unión de significativos', ui.entities === universe.size, `${ui.entities} vs ${universe.size}`);
  check('sin errores de consola', c.problems.length === 0, c.problems.join('; '));
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  failed = true;
} finally {
  c.kill();
  if (server.started) server.stop();
}
console.log('\nRESULTADO compare-overlap: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
