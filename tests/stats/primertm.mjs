// Tm de vecino más próximo (js/lib/primerAnalysis.js) vs Bio.SeqUtils.MeltingTemp
// (Biopython) — mismo patrón que los tests de stats/ vs R: JS vs GOLDEN
// SIEMPRE, y si Biopython está instalado, recalcula en vivo y compara los tres.
// nn_table=DNA_NN3 (Allawi & SantaLucia 1997 = tabla "unificada" de
// SantaLucia 1998 PNAS), saltcorr=5 (SantaLucia 1998, corrección de ΔS).

import { APP_ROOT, hasBiopython, pyRun } from '../lib/env.mjs';
import { maxRel, done } from './_shared.mjs';

const { tmNN, meltingTemp } = await import(APP_ROOT + '/js/lib/primerAnalysis.js');

// secuencias concretas (sin degeneradas): la de ejemplo del docstring de
// Biopython + variantes resueltas de los primers universales 16S 515F/806R,
// con varias combinaciones de sal/concentración de primer.
const CASES = [
  { seq: 'CGTTCCAAAGATGTGGGCATGAGCTTAC', Na: 50, dnac1: 500, dnac2: 0 },
  { seq: 'GTGCCAGCAGCCGCGGTAA', Na: 50, dnac1: 500, dnac2: 0 },
  { seq: 'GTGTCAGCCGCCGCGGTAA', Na: 50, dnac1: 500, dnac2: 0 },
  { seq: 'GGACTACAAGGGTATCTAAT', Na: 50, dnac1: 500, dnac2: 0 },
  { seq: 'GGACTACCGGGGTTTCTAAT', Na: 50, dnac1: 500, dnac2: 0 },
  { seq: 'GTGCCAGCAGCCGCGGTAA', Na: 20, dnac1: 500, dnac2: 0 },
  { seq: 'GTGCCAGCAGCCGCGGTAA', Na: 100, dnac1: 500, dnac2: 0 },
  { seq: 'GTGCCAGCAGCCGCGGTAA', Na: 50, dnac1: 250, dnac2: 0 },
  { seq: 'GTGCCAGCAGCCGCGGTAA', Na: 50, dnac1: 100, dnac2: 0 },
  { seq: 'AAAAAAAAAAAAAAAAAAAA', Na: 50, dnac1: 500, dnac2: 0 },
];

// GOLDEN: Bio.SeqUtils.MeltingTemp.Tm_NN(seq, nn_table=DNA_NN3, saltcorr=5,
// Na=Na, dnac1=dnac1, dnac2=dnac2) — Biopython 1.85, calculado al escribir el test.
const GOLDEN = [
  64.01823818597256, 65.66822957493696, 65.33510591388205, 50.00909207115444,
  55.620210083584084, 61.231822908459264, 69.10324290944783, 64.65123267561512,
  63.31616864400411, 40.85063236769719,
];

const js = CASES.map((c) => tmNN(c.seq, c));
const rel = maxRel(js, GOLDEN);
console.log(`  JS vs GOLDEN(Biopython)  n=${js.length}  err.rel máx ${rel.toExponential(2)}  ${rel < 1e-9 ? 'OK' : 'FALLA'}`);
let ok = rel < 1e-9;

// primer degenerado 515F (GTGYCAGCMGCCGCGGTAA): min/max/media sobre las 4
// resoluciones concretas (Y∈{C,T}, M∈{A,C}) — comprueba expandVariants()
// además de tmNN().
const degGolden = { min: 62.82479608353583, max: 68.15919656706251, mean: 65.49683203485434 };
const deg = meltingTemp('GTGYCAGCMGCCGCGGTAA', { Na: 50, dnac1: 500, dnac2: 0 });
const degErr = Math.max(
  Math.abs(deg.min - degGolden.min) / Math.abs(degGolden.min),
  Math.abs(deg.max - degGolden.max) / Math.abs(degGolden.max),
  Math.abs(deg.mean - degGolden.mean) / Math.abs(degGolden.mean),
);
console.log(`  515F degenerado (4 combos): min=${deg.min.toFixed(3)} max=${deg.max.toFixed(3)} media=${deg.mean.toFixed(3)}  err.rel máx ${degErr.toExponential(2)}  ${degErr < 1e-9 ? 'OK' : 'FALLA'} · n=${deg.n} exact=${deg.exact}`);
if (!(degErr < 1e-9 && deg.n === 4 && deg.exact)) ok = false;

if (!hasBiopython()) {
  console.log('  Biopython vivo: no instalado (import Bio falla) → solo modo GOLDEN');
} else {
  try {
    const script = `
import json
from Bio.SeqUtils import MeltingTemp as mt
cases = json.loads('''${JSON.stringify(CASES)}''')
out = [mt.Tm_NN(c['seq'], nn_table=mt.DNA_NN3, saltcorr=5, Na=c['Na'], dnac1=c['dnac1'], dnac2=c['dnac2']) for c in cases]
print(json.dumps(out))
`;
    const out = pyRun(script).trim();
    const pyOut = JSON.parse(out.slice(out.indexOf('[')));
    const rvG = maxRel(pyOut, GOLDEN);
    const rvJ = maxRel(pyOut, js);
    console.log(`  Biopython(vivo) vs GOLDEN  err.rel máx ${rvG.toExponential(2)}  ${rvG < 1e-9 ? 'OK' : 'FALLA (¿deriva de versión?)'}`);
    console.log(`  Biopython(vivo) vs JS      err.rel máx ${rvJ.toExponential(2)}  ${rvJ < 1e-9 ? 'OK' : 'FALLA'}`);
    if (!(rvG < 1e-9) || !(rvJ < 1e-9)) ok = false;
  } catch (e) {
    console.log('  Biopython vivo: falló la ejecución → solo modo GOLDEN (' + (e.message || e).toString().split('\n')[0] + ')');
  }
}

done('primer-tm', ok);
