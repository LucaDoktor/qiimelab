// Sensatez del solapamiento forward/reverse + consenso (js/lib/sangerOverlap.js)
// contra los cromatogramas REALES de datos-ejemplo/sanger/: un caso limpio
// (B13, amplicón 27F/1492R completo, ~1450 pb) y el caso B1, diagnosticado a
// mano en el prompt de este módulo: forward recortado ~266-280 nt, reverse
// recortado ~770-850 nt — con ese amplicón, 266+772-1450 ≈ −412, así que NO
// hay overlap real posible. El pipeline de referencia (PairwiseAligner local,
// sin ancla) encontraba ahí un bloque "alineado" de 267 nt al 56% de
// identidad — un falso positivo por motivos cortos conservados de 16S
// encadenados por huecos. Este módulo no debe repetir ese error.
//
//   node tests/sangeroverlap.mjs

import { readFileSync } from 'node:fs';
import { APP_ROOT } from './lib/env.mjs';
const { parseAb1 } = await import(APP_ROOT + '/js/lib/ab1Parser.js');
const { mottTrim } = await import(APP_ROOT + '/js/lib/sangerTrim.js');
const {
  reverseComplement, findSeedAnchor, overlapAlign, windowedIdentityTrim, consensusBase, mergeReads,
} = await import(APP_ROOT + '/js/lib/sangerOverlap.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

function loadTrimmed(path) {
  const buf = readFileSync(path);
  const { sequence, quality } = parseAb1(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const t = mottTrim(quality, { errorProbThreshold: 0.05 });
  return { sequence: sequence.slice(t.start, t.end), quality: quality.slice(t.start, t.end) };
}

// --- primitivas ---
{
  check('reverseComplement: caso conocido', reverseComplement('ACGTN') === 'NACGT');
}
{
  // 3 diagonales con 1 acierto cada una (ruido tipo "motivos cortos dispersos")
  // frente a 1 diagonal con 5 aciertos (solapamiento real) -> debe elegir la última
  const a = 'ACGTACGATCGATCGATTAGCGCGCGTATATATCGCGATATCGCTAGCTAGCTAGGGCATGCATGCATGCATG';
  const b = a.slice(20); // comparte un tramo largo real con `a` desde la posición 20
  const anchor = findSeedAnchor(a, b, { k: 12, diagonalBand: 1, minSeedHits: 3 });
  check('findSeedAnchor: solapamiento real -> ancla fiable en la diagonal correcta', anchor.reliable && anchor.diagonal === 20,
    'diagonal=' + anchor.diagonal + ' score=' + anchor.score);
}
{
  const anchor = findSeedAnchor('ACGTACGTACGTACGTACGT', 'TTTTTTTTTTTTTTTTTTTT', { k: 12, minSeedHits: 3 });
  check('findSeedAnchor: sin ningún k-mero compartido -> no fiable', !anchor.reliable && anchor.diagonal === null);
}
{
  // extremos libres: 'a' tiene un prefijo único que NO debe forzarse a alinear
  const aln = overlapAlign('XXXXXACGTACGT', 'ACGTACGTYYYY', { match: 1, mismatch: -1, gap: -2 });
  check('overlapAlign: no penaliza el prefijo único de A (arranque libre)', aln.aStart === 5, 'aStart=' + aln.aStart);
  check('overlapAlign: no penaliza el sufijo único de B (final libre)', aln.bEnd === 8, 'bEnd=' + aln.bEnd);
  check('overlapAlign: el bloque compartido sale sin huecos', aln.colsA === 'ACGTACGT' && aln.colsB === 'ACGTACGT');
}
{
  // ventana con una caída de identidad sostenida en la segunda mitad
  const colsA = 'A'.repeat(30) + 'ACGTACGTAC'.repeat(3);
  const colsB = 'A'.repeat(30) + 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT';
  const cut = windowedIdentityTrim(colsA, colsB, { window: 10, minIdentity: 0.8, maxBadRun: 2 });
  check('windowedIdentityTrim: recorta al final del tramo bueno cuando la identidad cae de forma sostenida',
    cut >= 28 && cut <= 32, 'cut=' + cut + ' (longitud total=' + colsA.length + ')');
}
{
  check('consensusBase: coinciden -> esa base', consensusBase('A', 30, 'A', 10) === 'A');
  check('consensusBase: hueco en un lado -> la otra base', consensusBase('-', null, 'C', 40) === 'C');
  check('consensusBase: discrepan, diferencia grande de calidad -> la de más Phred', consensusBase('A', 55, 'G', 15) === 'A');
  check('consensusBase: discrepan, calidades parecidas y altas -> código IUPAC (no N a ciegas)',
    consensusBase('A', 40, 'G', 38) === 'R');
  check('consensusBase: discrepan, ambas calidades bajas -> N', consensusBase('A', 8, 'G', 6) === 'N');
}

// --- caso bueno real: B13 ---
{
  const f = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-27F.ab1');
  const r = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B13-1492R.ab1');
  const res = mergeReads(f, r, { expectedAmpliconLen: 1450 });
  check('B13: se fusiona (method=merged)', res.method === 'merged', JSON.stringify({ method: res.method, reason: res.reason }));
  check('B13: no queda marcado para revisión', !res.needsReview);
  check('B13: overlap de longitud compatible con el pipeline de referencia (400-750 nt)',
    res.overlapLen >= 400 && res.overlapLen <= 750, 'overlapLen=' + res.overlapLen);
  check('B13: identidad muy alta (>99%), como en diagnostico_ensamblaje.csv (100%)', res.identity > 0.99, 'identity=' + res.identity.toFixed(4));
  check('B13: consenso de longitud plausible para el amplicón 27F/1492R (1300-1500 nt)',
    res.consensus.length >= 1300 && res.consensus.length <= 1500, 'len=' + res.consensus.length);
}

// --- caso B1: sin overlap real posible (267/56% era un falso positivo) ---
{
  const f = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B1-27F.ab1');
  const r = loadTrimmed(APP_ROOT + '/datos-ejemplo/sanger/B1-1492R.ab1');
  const res = mergeReads(f, r, { expectedAmpliconLen: 1450 });
  check('B1: NO se acepta un merge normal (el pipeline de referencia sí lo hacía, mal)', res.method !== 'merged' || res.needsReview);
  check('B1: si cae a stitched, queda marcado para revisión manual', res.method !== 'stitched' || res.needsReview);
  check('B1: nunca reporta el solapamiento espurio de ~267nt/56% del pipeline de referencia',
    !(res.overlapLen > 150 && res.identity < 0.8), 'overlapLen=' + res.overlapLen + ' identity=' + res.identity.toFixed(3));
  check('B1: si hay un solapamiento aceptado, su identidad es alta (no un bloque de baja identidad "colado")',
    res.overlapLen === 0 || res.identity >= 0.9, 'overlapLen=' + res.overlapLen + ' identity=' + res.identity.toFixed(3));
}

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
