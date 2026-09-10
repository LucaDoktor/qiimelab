// Diseño de novo de primers sobre una secuencia concreta (no un genoma):
// ventana deslizante + filtros de calidad + emparejado + puntuación al
// estilo Primer3. Reutiliza — no reimplementa — el resto de la librería de
// primers: Tm/GC/composición (primerAnalysis.js), horquillas/dímeros
// (primerDimers.js) y la búsqueda de posiciones (primerTemplate.js, para
// la comprobación de especificidad final de la lista corta).
//
// Dos modos con valores por defecto editables a mano (ver MODES): PCR
// estándar (producto largo, sin exigir Tm de pareja) y qPCR (producto
// corto, Tm de pareja ajustada, extremo 3' más exigente).

import { gcPercent, gcClamp, meltingTemp, reverseComplementIUPAC } from './primerAnalysis.js';
import { scanDimer, scanHairpin, classifyDimer, classifyHairpin } from './primerDimers.js';
import { findPrimerSites } from './primerTemplate.js';

export const MIN_PRIMER_LEN = 18;
export const MAX_PRIMER_LEN = 27;

/** Valores por defecto por modo — todos editables por el usuario en la UI
 *  (se le pasa un objeto `mode` ya fusionado con sus cambios). */
export const MODES = {
  standard: {
    ampliconMin: 100, ampliconMax: 2000,
    tmMin: 50, tmMax: 60,      // 55 ± 5 °C
    maxDeltaTm: null,          // "sin restricción fuerte"
    gcMin: 40, gcMax: 60, gcIdeal: 50,
    threePrimeIdealGC: null,   // sin ideal de composición 3' específico
    weightDeltaTm: 0.4, weightHetero: 1,
  },
  qpcr: {
    ampliconMin: 60, ampliconMax: 200,
    tmMin: 59, tmMax: 61,
    maxDeltaTm: 5,
    gcMin: 40, gcMax: 60, gcIdeal: 50,
    threePrimeIdealGC: 2,      // ideal ~3×A/T + 2×G/C en los últimos 5 nt
    weightDeltaTm: 2, weightHetero: 2.5,
  },
};

// pesos internos del algoritmo (no editables desde la UI — son la "receta"
// de puntuación, no una restricción de diseño como las de MODES).
const W = {
  tm: 1, gc: 0.3, clamp: 2, threePrimeComposition: 0.5,
  size: 12, deltaTmOverflow: 15,
  hairpin: { ok: 0, warn: 1, crit: Infinity },
  selfDimer: { ok: 0, warn: 1, crit: Infinity },
  heteroDimer: { ok: 0, warn: 1.5, crit: 4 },
};

function mergeMode(name, overrides) {
  return { ...(MODES[name] || MODES.standard), ...overrides };
}

function longestRun(seq) {
  let run = 1, best = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) { run++; best = Math.max(best, run); }
    else run = 1;
  }
  return best;
}

function threePrimeGCRun(seq, zone = 5) {
  const tail = seq.slice(-zone);
  let run = 0, best = 0;
  for (const c of tail) { if (c === 'G' || c === 'C') { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}

function threePrimeGCCount(seq, zone = 5) {
  return [...seq.slice(-zone)].filter((c) => c === 'G' || c === 'C').length;
}

/** Evalúa UN candidato (ya recortado) contra los filtros/puntuación de
 *  `mode`. Devuelve null si no pasa un filtro "duro"; si no, el objeto con
 *  su Tm/GC/clamp/horquilla/autodímero y su penalización parcial (solo la
 *  suya — la del par se añade en scorePair). */
export function evaluateCandidate(seq, mode, opts = {}) {
  if (longestRun(seq) > (opts.maxHomopolymer ?? 4)) return null;
  if (threePrimeGCRun(seq, 5) > 3) return null; // ambos modos: evitar runs G/C > 3 en el 3'

  const gc = gcPercent(seq).pct;
  if (gc < mode.gcMin || gc > mode.gcMax) return null;

  const tmRes = meltingTemp(seq, opts.tmOptions);
  const tm = tmRes.tm;
  if (!Number.isFinite(tm) || tm < mode.tmMin || tm > mode.tmMax) return null;

  const hairpin = scanHairpin(seq);
  const hairpinLevel = classifyHairpin(hairpin);
  if (hairpinLevel === 'crit') return null; // horquilla fuerte -> descartar

  const selfDimer = scanDimer(seq, seq);
  const selfDimerLevel = classifyDimer(selfDimer);
  if (selfDimerLevel === 'crit') return null; // autodímero fuerte -> descartar

  const clamp = gcClamp(seq);
  const tmTarget = (mode.tmMin + mode.tmMax) / 2;

  let penalty = W.tm * Math.abs(tm - tmTarget) + W.gc * Math.abs(gc - (mode.gcIdeal ?? 50));
  if (clamp.status !== 'ok') penalty += W.clamp;
  if (mode.threePrimeIdealGC != null) penalty += W.threePrimeComposition * Math.abs(threePrimeGCCount(seq) - mode.threePrimeIdealGC);
  penalty += W.hairpin[hairpinLevel] || 0;
  penalty += W.selfDimer[selfDimerLevel] || 0;

  return { seq, tm, tmMin: tmRes.min, tmMax: tmRes.max, gc, clamp, hairpin, hairpinLevel, selfDimer, selfDimerLevel, penalty };
}

/** Mapa longitud -> (subcadena del "+" -> nº de apariciones) del propio
 *  `template`, para la comprobación de especificidad en O(1) por candidato
 *  en vez de re-buscar en todo el template uno a uno (mismo resultado que
 *  llamar a findPrimerSites con maxMismatches:0 y contar, pero factible
 *  sobre miles de candidatos). */
function buildOccurrenceIndex(template, minLen, maxLen) {
  const byLen = new Map();
  for (let len = minLen; len <= maxLen; len++) {
    const map = new Map();
    for (let i = 0; i + len <= template.length; i++) {
      const s = template.slice(i, i + len);
      map.set(s, (map.get(s) || 0) + 1);
    }
    byLen.set(len, map);
  }
  return byLen;
}

/** Nº de sitios (las dos hebras) donde `seq` encajaría EXACTO en el
 *  template — equivalente a findPrimerSites(template, seq, {maxMismatches:0}).length. */
function occurrenceCount(index, seq) {
  const map = index.get(seq.length);
  if (!map) return 0;
  const rc = reverseComplementIUPAC(seq);
  return (map.get(seq) || 0) + (map.get(rc) || 0);
}

/**
 * Genera candidatos con ventana deslizante (MIN_PRIMER_LEN..MAX_PRIMER_LEN)
 * sobre las dos hebras de `template`, filtrados/puntuados según `mode`.
 * Cada candidato lleva su posición en el template (0-based, en coordenadas
 * de la hebra "+"): un candidato "-" es el complementario inverso de esa
 * ventana (se uniría a la hebra "+" en esa misma región, por la otra cara).
 */
export function generateCandidates(template, mode, opts = {}) {
  const minLen = opts.minLen ?? MIN_PRIMER_LEN, maxLen = opts.maxLen ?? MAX_PRIMER_LEN;
  const index = buildOccurrenceIndex(template, minLen, maxLen);
  const out = [];
  for (let start = 0; start + minLen <= template.length; start++) {
    for (let len = minLen; len <= maxLen && start + len <= template.length; len++) {
      const window = template.slice(start, start + len);
      const end = start + len;

      const fwdSeq = window;
      if (occurrenceCount(index, fwdSeq) === 1) {
        const ev = evaluateCandidate(fwdSeq, mode, opts);
        if (ev) out.push({ ...ev, strand: '+', start, end });
      }
      const revSeq = reverseComplementIUPAC(window);
      if (occurrenceCount(index, revSeq) === 1) {
        const ev = evaluateCandidate(revSeq, mode, opts);
        if (ev) out.push({ ...ev, strand: '-', start, end });
      }
    }
  }
  return out;
}

function prelimPenalty(f, r, size, deltaTm, mode) {
  const idealSize = (mode.ampliconMin + mode.ampliconMax) / 2;
  let penalty = f.penalty + r.penalty;
  penalty += W.size * Math.abs(size - idealSize) / Math.max(1, mode.ampliconMax - mode.ampliconMin);
  penalty += (mode.weightDeltaTm ?? 1) * deltaTm;
  if (mode.maxDeltaTm != null && deltaTm > mode.maxDeltaTm) penalty += W.deltaTmOverflow;
  return penalty;
}

function finalizePair(f, r, size, deltaTm, mode, penaltySoFar) {
  const hetero = scanDimer(f.seq, r.seq);
  const heteroLevel = classifyDimer(hetero);
  const penalty = penaltySoFar + (mode.weightHetero ?? 1) * (W.heteroDimer[heteroLevel] || 0);
  return { forward: f, reverse: r, size, deltaTm, heteroDimer: hetero, heteroLevel, penalty };
}

/**
 * Empareja candidatos "+"/"-" cuyo producto caiga en [mode.ampliconMin,
 * mode.ampliconMax] (y, si se da, dentro de `opts.targetRegion = {start,end}`),
 * puntúa cada pareja y devuelve las mejores ordenadas de menor a mayor
 * penalización.
 *
 * Sobre un gen de tamaño normal puede haber cientos de miles de parejas
 * candidatas — calcular el heterodímero de la pareja (scanDimer, el término
 * más caro) para TODAS sería lento sin aportar nada, porque solo interesan
 * las mejores. Por eso se puntúa primero SIN heterodímero (aritmética,
 * barata) y solo se recalcula con heterodímero — la puntuación final — para
 * las `opts.heteroShortlist` mejores por esa puntuación preliminar. Con un
 * margen holgado (300 por defecto, muchas veces más que las 5-10 que se
 * enseñan) el heterodímero no cambia qué entra en el top final; si alguna
 * vez importase, se sube el margen.
 */
export function pairCandidates(candidates, mode, opts = {}) {
  const fwd = candidates.filter((c) => c.strand === '+');
  const rev = candidates.filter((c) => c.strand === '-').slice().sort((a, b) => a.start - b.start);
  const prelim = [];
  fwd.forEach((f) => {
    for (const r of rev) {
      if (r.start < f.end) continue; // sin solape
      const size = r.end - f.start;
      if (size > mode.ampliconMax) break; // rev está ordenado por posición: ya no hay más cerca
      if (size < mode.ampliconMin) continue;
      if (opts.targetRegion && (f.start < opts.targetRegion.start || r.end > opts.targetRegion.end)) continue;
      const deltaTm = Math.abs(f.tm - r.tm);
      prelim.push({ f, r, size, deltaTm, penalty: prelimPenalty(f, r, size, deltaTm, mode) });
    }
  });
  prelim.sort((a, b) => a.penalty - b.penalty);
  const shortlist = prelim.slice(0, opts.heteroShortlist ?? 300);
  return shortlist
    .map((p) => finalizePair(p.f, p.r, p.size, p.deltaTm, mode, p.penalty))
    .sort((a, b) => a.penalty - b.penalty);
}

/**
 * Orquesta todo: genera candidatos, los empareja y devuelve las mejores
 * `topN` parejas. `modeName`: 'standard' | 'qpcr'. `modeOverrides`: cambios
 * a mano sobre los valores por defecto de ese modo (rangos, Tm, etc.).
 */
export function designPrimers(template, modeName, { modeOverrides, topN = 10, targetRegion, ...opts } = {}) {
  const mode = mergeMode(modeName, modeOverrides);
  const candidates = generateCandidates(template, mode, opts);
  const pairs = pairCandidates(candidates, mode, { targetRegion });
  return { mode, modeName, candidatesEvaluated: candidates.length, pairs: pairs.slice(0, topN) };
}

/** Confirmación final (opcional) de una pareja ya elegida, reutilizando
 *  findPrimerSites — para que la UI pueda mostrar "aparece 1 vez en cada
 *  hebra, tal como se diseñó" con la MISMA función que usa la pestaña
 *  Plantilla, no un cálculo aparte. */
export function confirmSpecificity(template, pair) {
  return {
    forwardSites: findPrimerSites(template, pair.forward.seq, { maxMismatches: 0 }).length,
    reverseSites: findPrimerSites(template, pair.reverse.seq, { maxMismatches: 0 }).length,
  };
}
