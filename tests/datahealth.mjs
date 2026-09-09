// Fixtures a mano de checkDataHealth(): cada tipo de fallo provocado a
// propósito → el checker encuentra EXACTAMENTE eso, ni más ni menos.
// Node puro (no navegador, no R): state.js y dataHealth.js son módulos ES sin
// dependencias del DOM.
//
//   node tests/datahealth.mjs

import { APP_ROOT } from './lib/env.mjs';

const { state } = await import(APP_ROOT + '/js/state.js');
const { checkDataHealth } = await import(APP_ROOT + '/js/lib/dataHealth.js');

function reset() {
  state.files = [];
  ['metadata', 'taxonomy', 'taxaBarplot', 'alphaDiversity', 'betaDiversity',
    'differentialAbundance', 'taxaCounts', 'functionalKO', 'functionalCategories', 'ordination'].forEach((k) => { state[k] = null; });
  state.sequenceQC = [];
  state.diffComparisons = [];
}
const mdRows = (ids) => ids.map((id) => ({ 'sample-id': id, grupo: 'G' + id.slice(-1) }));
const setMeta = (rows) => { state.metadata = { sourceFileId: 'f1', headers: ['sample-id', 'grupo'], rows, sampleIdKey: 'sample-id' }; };
const setCounts = (ids) => {
  state.taxaCounts = {
    sourceFileId: 'f2', taxonKey: 'taxon', headers: ['taxon', ...ids],
    rows: [Object.fromEntries([['taxon', 'Bacteroides'], ...ids.map((s) => [s, '10'])])],
  };
};

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : '  — ' + detail)); };
const codes = (f) => f.map((x) => x.code).sort();

reset(); setMeta(mdRows(['A-1', 'A-2', 'B-1'])); setCounts(['A-1', 'A-2', 'B-1']);
check('sin fallos → 0 hallazgos', checkDataHealth().length === 0, JSON.stringify(checkDataHealth()));

reset(); setMeta(mdRows(['A-1', 'A-2', 'A-2', 'B-1'])); setCounts(['A-1', 'A-2', 'B-1']);
let f = checkDataHealth();
check('id duplicado: solo metadata_duplicate_ids', codes(f).join() === 'metadata_duplicate_ids', JSON.stringify(codes(f)));
check('  → señala A-2, nivel error', f[0].sampleIds.join() === 'A-2' && f[0].level === 'error', JSON.stringify(f[0]));

reset(); setMeta(mdRows(['A-1', 'A-2'])); setCounts(['A-1', 'A-2', 'Z-9']);
f = checkDataHealth();
let g = f.find((x) => x.code === 'samples_not_in_metadata');
check('muestra de más: samples_not_in_metadata Z-9, warning', !!g && g.sampleIds.join() === 'Z-9' && g.level === 'warning', JSON.stringify(f));
check('  → sin metadata_samples_unused', !codes(f).includes('metadata_samples_unused'), JSON.stringify(codes(f)));

reset(); setMeta(mdRows(['A-1', 'A-2', 'A-3'])); setCounts(['A-1', 'A-2']);
f = checkDataHealth();
g = f.find((x) => x.code === 'metadata_samples_unused');
check('muestra de menos: metadata_samples_unused A-3, info', !!g && g.sampleIds.join() === 'A-3' && g.level === 'info', JSON.stringify(f));

reset();
setMeta([{ 'sample-id': 'A-1', grupo: 'Control' }, { 'sample-id': 'A-2', grupo: '' }, { 'sample-id': 'A-3', grupo: 'Trat' }]);
setCounts(['A-1', 'A-2', 'A-3']);
f = checkDataHealth();
g = f.find((x) => x.code === 'group_column_empty');
check('celda de grupo vacía: group_column_empty «grupo» A-2, warning',
  codes(f).join() === 'group_column_empty' && g.column === 'grupo' && g.sampleIds.join() === 'A-2' && g.level === 'warning', JSON.stringify(f));

reset();
setMeta([
  { 'sample-id': 'A-1', grupo: 'Control' }, { 'sample-id': 'A-2', grupo: 'Control' },
  { 'sample-id': 'A-2', grupo: 'Control' }, { 'sample-id': 'A-3', grupo: '' }, { 'sample-id': 'A-4', grupo: 'Trat' },
]);
setCounts(['A-1', 'A-2', 'A-3', 'Z-9']);
check('los 4 fallos a la vez → exactamente 4 hallazgos',
  checkDataHealth().length === 4
  && codes(checkDataHealth()).join() === ['group_column_empty', 'metadata_duplicate_ids', 'metadata_samples_unused', 'samples_not_in_metadata'].join(),
  JSON.stringify(codes(checkDataHealth())));

reset(); setMeta(mdRows(['A-1', 'A-2'])); setCounts(['A-1-16S-L001', 'A-2-16S-L001']);
check('sufijos: A-1-16S casa con A-1 → 0 hallazgos', checkDataHealth().length === 0, JSON.stringify(checkDataHealth()));

console.log(`\n${pass} ok · ${fail} fallo(s)`);
console.log('RESULTADO datahealth: ' + (fail ? 'FAIL' : 'PASS'));
process.exit(fail ? 1 : 0);
