// Auto-dímeros, hetero-dímeros y horquillas (hairpins), para un primer solo
// o para toda una matriz (diseño multiplex). Heurística determinista, no un
// solver de plegado completo (sin bucles internos ni mismatches dentro del
// tallo): busca el tramo contiguo perfectamente complementario más largo
// (o el tallo de horquilla más largo) y le calcula una ΔG aproximada con las
// MISMAS ΔH/ΔS de vecino más próximo que la Tm (js/lib/primerAnalysis.js).
//
// Las bases IUPAC degeneradas del tramo encontrado se resuelven a una base
// concreta "peor caso" (con más G/C) solo para la puntuación ΔG — deliberado:
// mejor sobrestimar el riesgo de un primer degenerado que pasarlo por alto.
//
// Verificado con casos construidos a mano (tests/primers/dimers.mjs): un
// primer con un palíndromo GC fuerte (auto-dímero/horquillas) frente a uno
// sin ninguna base complementaria a sí mismo (poli-A) — ver ese archivo para
// el razonamiento de por qué cada caso debe dar lo que da.

import { iupacComplementary, deltaG } from './primerAnalysis.js';

const GC_BIASED_PROTOTYPE = {
  A: 'A', C: 'C', G: 'G', T: 'T',
  R: 'G', Y: 'C', M: 'C', K: 'G', S: 'C', W: 'A',
  B: 'C', D: 'G', H: 'C', V: 'G', N: 'G',
};

function resolveRepresentative(seq) {
  return [...seq].map((c) => GC_BIASED_PROTOTYPE[c] || 'A').join('');
}

const END_ZONE = 3; // "cerca del extremo" para marcar 3'/5' en dímeros y horquillas
const MIN_DIMER_RUN = 4;
const MIN_HAIRPIN_STEM = 3;
const MIN_HAIRPIN_LOOP = 3;

/** Busca la mejor alineación antiparalela (offset deslizante) entre dos
 *  secuencias IUPAC — el tramo contiguo complementario más largo, con su ΔG
 *  aproximada. `seqA`/`seqB` pueden ser el mismo primer (auto-dímero). */
export function scanDimer(seqA, seqB, { minRun = MIN_DIMER_RUN } = {}) {
  const nA = seqA.length, nB = seqB.length;
  let best = null;
  for (let offset = -(nB - 1); offset <= nA - 1; offset++) {
    const aStart = Math.max(0, offset), aEnd = Math.min(nA, offset + nB);
    if (aEnd <= aStart) continue;
    let curLen = 0, curStart = -1, localBest = null;
    for (let i = aStart; i < aEnd; i++) {
      const bIdx = nB - 1 - (i - offset);
      if (iupacComplementary(seqA[i], seqB[bIdx])) {
        if (curLen === 0) curStart = i;
        curLen++;
        if (!localBest || curLen > localBest.len) localBest = { len: curLen, start: curStart, end: i + 1 };
      } else curLen = 0;
    }
    if (!localBest || localBest.len < minRun) continue;
    const aPos = localBest.start, aEndPos = localBest.end;
    const bIdxAtStart = nB - 1 - (aPos - offset);
    const bIdxAtEnd = nB - 1 - (aEndPos - 1 - offset);
    const bStart = bIdxAtEnd, bEnd = bIdxAtStart + 1;
    const dG = deltaG(resolveRepresentative(seqA.slice(aPos, aEndPos)));
    const cand = {
      offset, len: localBest.len,
      aStart: aPos, aEnd: aEndPos, bStart, bEnd, dG,
      touches3A: aEndPos >= nA - END_ZONE, touches5A: aPos < END_ZONE,
      touches3B: bEnd >= nB - END_ZONE, touches5B: bStart < END_ZONE,
    };
    if (!best || cand.dG < best.dG) best = cand;
  }
  return best;
}

/** Busca la mejor horquilla intramolecular: dos brazos complementarios
 *  separados por un bucle (bucle mínimo 3 nt, tallo mínimo 3 pb). */
export function scanHairpin(seq, { minStem = MIN_HAIRPIN_STEM, minLoop = MIN_HAIRPIN_LOOP } = {}) {
  const n = seq.length;
  let best = null;
  for (let p = 0; p < n; p++) {
    for (let loopLen = minLoop; p + loopLen < n; loopLen++) {
      let i = p - 1, j = p + loopLen, stem = 0;
      while (i >= 0 && j < n && iupacComplementary(seq[i], seq[j])) { stem++; i--; j++; }
      if (stem < minStem) continue;
      const armStart = i + 1, armEnd = p, stem2Start = p + loopLen, stem2End = p + loopLen + stem;
      const dG = deltaG(resolveRepresentative(seq.slice(armStart, armEnd)));
      const cand = {
        stem, loopStart: p, loopEnd: p + loopLen,
        armStart, armEnd, stem2Start, stem2End, dG,
        touches3: stem2End >= n - END_ZONE, touches5: armStart < END_ZONE,
      };
      if (!best || cand.dG < best.dG) best = cand;
    }
  }
  return best;
}

/** Clasificación de riesgo — umbrales heurísticos habituales en el diseño de
 *  primers (ΔG más negativa = dúplex más estable = peor); NO son una ley
 *  física exacta, solo una guía visual. Un tramo/tallo que además toca un
 *  extremo 3' es más grave (la polimerasa puede extenderlo). */
export function classifyDimer(cand) {
  if (!cand) return 'ok';
  const near3 = cand.touches3A || cand.touches3B;
  if (cand.dG <= -9 || (near3 && cand.dG <= -6)) return 'crit';
  if (cand.dG <= -6 || cand.len >= 6) return 'warn';
  return 'ok';
}

export function classifyHairpin(cand) {
  if (!cand) return 'ok';
  if (cand.dG <= -9 || (cand.touches3 && cand.dG <= -6)) return 'crit';
  if (cand.dG <= -6 || cand.stem >= 6) return 'warn';
  return 'ok';
}

export function heteroKey(idA, idB) {
  return idA < idB ? idA + '::' + idB : idB + '::' + idA;
}

/** Matriz completa para un conjunto de primers {id, seq}: auto-dímero +
 *  horquilla por primer, hetero-dímero por cada pareja (sin repetir A×B y
 *  B×A — es la misma física de dúplex vista desde el otro lado). */
export function buildDimerMatrix(primers) {
  const selfDimer = {}, hairpin = {}, hetero = {};
  primers.forEach((p) => {
    selfDimer[p.id] = scanDimer(p.seq, p.seq);
    hairpin[p.id] = scanHairpin(p.seq);
  });
  for (let i = 0; i < primers.length; i++) {
    for (let j = i + 1; j < primers.length; j++) {
      hetero[heteroKey(primers[i].id, primers[j].id)] = scanDimer(primers[i].seq, primers[j].seq);
    }
  }
  return { selfDimer, hairpin, hetero };
}

export function getHetero(matrix, idA, idB) {
  if (idA === idB) return matrix.selfDimer[idA];
  return matrix.hetero[heteroKey(idA, idB)];
}
