// Ciclo exportar → clearAllState → importar sesión, con canarios numéricos que
// deben quedar idénticos BIT A BIT y sin referencias sourceFileId colgadas.
//
//   node tests/sweep-session.mjs

import { ensureServer } from './lib/server.mjs';
import { connect } from './lib/cdp.mjs';
import { findChrome, skip } from './lib/env.mjs';
import { ROUTES, LOAD_ALL, walkRoute, waitQC, sleep } from './lib/app.mjs';

if (!findChrome()) skip('no se encontró Chrome/Chromium');
const server = await ensureServer();
if (!server) skip('no se pudo servir la app (¿python3?)');

// instantánea de canarios + búsqueda recursiva de sourceFileId colgados
const SNAP = `(async () => {
  const { state } = await import('/js/state.js');
  const { kruskalWallis } = await import('/js/lib/stats.js');
  const tc = state.taxaCounts;
  const taxonKey = tc.taxonKey || tc.headers[0];
  const scols = tc.headers.filter(h => h !== taxonKey);
  let minN = Infinity;
  scols.forEach(s => { let N = 0; tc.rows.forEach(r => N += Math.round(parseFloat(r[s]) || 0)); if (N > 0) minN = Math.min(minN, N); });
  const av = state.alphaDiversity.metrics.shannon_entropy.values;
  const meta = {}; state.metadata.rows.forEach(r => meta[r[state.metadata.sampleIdKey]] = r.grupo);
  const groups = {};
  Object.entries(av).forEach(([sid, v]) => { const g = meta[sid]; if (g) (groups[g] = groups[g] || []).push(v); });
  const kw = kruskalWallis(Object.values(groups));
  let csN = 0; Object.keys(localStorage).forEach(k => { if (k.indexOf('qiimelab.chartStyle.') === 0) csN++; });
  const ids = new Set(state.files.map(f => f.id));
  const dangling = [];
  const walk = (o, p) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, p + '[' + i + ']'));
    if (o && typeof o === 'object') for (const k in o) {
      if (k === 'sourceFileId' && o[k] && !ids.has(o[k])) dangling.push(p + '.' + k + '=' + o[k]);
      else walk(o[k], p + '.' + k);
    }
  };
  ['metadata','taxonomy','taxaBarplot','alphaDiversity','betaDiversity','differentialAbundance','taxaCounts','functionalKO','functionalCategories','ordination'].forEach(s => walk(state[s], s));
  walk(state.sequenceQC, 'sequenceQC');
  walk(state.diffComparisons, 'diffComparisons');
  walk(state.microbialCounts, 'microbialCounts');
  return {
    nTaxa: tc.rows.length, nSamplesCounts: tc.headers.length - 1, minN,
    pv0: state.ordination ? state.ordination.proportionExplained[0] : null,
    kwH: kw.H, kwP: kw.p, files: state.files.length, csN,
    lang: localStorage.getItem('qiimelab.lang'),
    diffRows: state.differentialAbundance.rows.length,
    diffComparisons: (state.diffComparisons || []).map(c => c.rows.length),
    microbialCounts: (state.microbialCounts || []).map(s => s.label + ':' + s.rows.length + ':' + (s.mapping.groupCols || []).join('-') + ':' + s.mapping.valueCol),
    betaMetrics: Object.keys(state.betaDiversity.metrics).sort(),
    qcReports: state.sequenceQC.filter(e => e.report).length,
    dangling,
  };
})()`;

const c = await connect({ url: server.url + '/index.html', label: 'session' });
let failed = false;
try {
  await c.goto();
  await sleep(1600);
  c.setLabel('carga de ejemplos');
  await c.ev(LOAD_ALL);
  await sleep(2500);
  await waitQC(c);

  // que la sesión lleve algo que restaurar: un estilo de gráfico y el idioma
  await c.ev(`localStorage.setItem('qiimelab.chartStyle.__test__', JSON.stringify({ title: { dx: 5, dy: -3 } }))`);
  await c.ev(`(async () => { const { setLang } = await import('/js/lib/i18n.js'); setLang('en'); })()`);
  await sleep(400);

  c.setLabel('canary-antes');
  const before = await c.ev(SNAP);

  c.setLabel('exportar + limpiar + importar');
  const imp = await c.ev(`(async () => {
    const { clearAllState, state } = await import('/js/state.js');
    const { exportSession, importSession, describeSession, SCHEMA_VERSION } = await import('/js/lib/session.js');
    const sess = exportSession();
    const json = JSON.stringify(sess);
    clearAllState();
    const cleared = { files: state.files.length, taxaCounts: !!state.taxaCounts, diffComparisons: (state.diffComparisons || []).length, microbialCounts: (state.microbialCounts || []).length };
    const res = importSession(JSON.parse(json));

    // --- versionado del esquema ---
    const schema = {
      hasSchemaVersion: sess.schemaVersion === SCHEMA_VERSION,
      // una sesión SIN campo de versión = esquema 1 heredado, se importa igual
      noVersionOk: importSession(JSON.parse(JSON.stringify({ ...JSON.parse(json), schemaVersion: undefined, sessionFormat: undefined }))).ok,
      // una sesión de una versión FUTURA: se importa best-effort + avisa
      tooNew: (() => {
        const r = importSession({ ...JSON.parse(json), schemaVersion: 999 });
        return r.ok && r.warnings.some((w) => /nueva|newer|999/.test(w));
      })(),
      describeMigrate: describeSession({ ...JSON.parse(json), schemaVersion: 999 }).tooNew === true,
    };
    // dejar el estado como debe quedar (con la sesión buena)
    clearAllState();
    importSession(JSON.parse(json));
    return { cleared, res, bytes: json.length, schema };
  })()`);
  await sleep(600);

  c.setLabel('re-barrido');
  for (const r of ROUTES) await walkRoute(c, r);

  c.setLabel('canary-despues');
  const after = await c.ev(SNAP);

  const keys = ['nTaxa', 'nSamplesCounts', 'minN', 'pv0', 'kwH', 'kwP', 'files', 'csN', 'lang', 'diffRows', 'diffComparisons', 'microbialCounts', 'betaMetrics', 'qcReports'];
  const diffs = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  console.log('sesión exportada :', imp.bytes, 'bytes');
  console.log('tras clearAllState:', JSON.stringify(imp.cleared), '→ import', JSON.stringify(imp.res));
  console.log('canarios          :', diffs.length === 0 ? 'idénticos bit a bit' : 'DIFIEREN');
  diffs.forEach((k) => console.log(`  ✗ ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`));
  console.log('sourceFileId colgados:', after.dangling.length, after.dangling.join(' ') || '');
  console.log('esquema de sesión :', JSON.stringify(imp.schema));
  console.log('errores de consola  :', c.problems.length ? c.problems.join('\n  ') : '(ninguno)');

  const schemaOk = imp.schema.hasSchemaVersion && imp.schema.noVersionOk && imp.schema.tooNew && imp.schema.describeMigrate;
  failed = diffs.length > 0 || after.dangling.length > 0 || imp.cleared.taxaCounts || imp.cleared.microbialCounts > 0 || !imp.res.ok || !schemaOk || c.problems.length > 0;
} catch (e) {
  console.error('EXCEPCIÓN:', e.message);
  failed = true;
} finally {
  c.kill();
  if (server.started) server.stop();
}
process.exit(failed ? 1 : 0);
