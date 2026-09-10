// Cálculos de primers: bases IUPAC degeneradas, composición, Tm por vecino
// más próximo (SantaLucia 1998, tabla "unificada" + corrección salina
// SantaLucia 1998 para dS), peso molecular y coeficiente de extinción.
//
// La Tm (tmNN) está verificada byte a byte contra Bio.SeqUtils.MeltingTemp.Tm_NN
// de Biopython (nn_table=DNA_NN3, saltcorr=5) — ver tests/stats/primertm.mjs.
// Solo cubre dúplex perfectamente complementario (sin mismatches/dangling
// ends): es justo lo que hace falta para la Tm de un primer contra su propio
// complementario.

export const IUPAC_SETS = {
  A: ['A'], C: ['C'], G: ['G'], T: ['T'],
  R: ['A', 'G'], Y: ['C', 'T'], M: ['A', 'C'], K: ['G', 'T'],
  S: ['C', 'G'], W: ['A', 'T'],
  B: ['C', 'G', 'T'], D: ['A', 'G', 'T'], H: ['A', 'C', 'T'], V: ['A', 'C', 'G'],
  N: ['A', 'C', 'G', 'T'],
};

export const IUPAC_COMPLEMENT = {
  A: 'T', T: 'A', C: 'G', G: 'C',
  R: 'Y', Y: 'R', M: 'K', K: 'M', S: 'S', W: 'W',
  B: 'V', V: 'B', D: 'H', H: 'D', N: 'N',
};

export const DEGENERATE_CODES = ['R', 'Y', 'M', 'K', 'S', 'W', 'B', 'D', 'H', 'V', 'N'];

const BASE_MW = { A: 313.21, C: 289.18, G: 329.21, T: 304.2 };
const BASE_EXT260 = { A: 15400, C: 7400, G: 11500, T: 8700 };

/** Limpia una secuencia pegada a mano: mayúsculas, quita espacios/números,
 *  transcribe U (RNA) a T. Devuelve { seq, invalid } — invalid = caracteres
 *  que no son ni ACGT ni una base IUPAC degenerada reconocida. */
export function cleanPrimerSeq(raw) {
  const upper = String(raw || '').toUpperCase().replace(/U/g, 'T').replace(/[^A-Z]/g, '');
  let seq = '';
  const invalid = [];
  for (const c of upper) {
    if (IUPAC_SETS[c]) seq += c;
    else invalid.push(c);
  }
  return { seq, invalid: [...new Set(invalid)] };
}

export function isValidIUPAC(seq) {
  return seq.length > 0 && [...seq].every((c) => IUPAC_SETS[c]);
}

export function hasDegenerate(seq) {
  return [...seq].some((c) => DEGENERATE_CODES.includes(c));
}

/** { length, counts:{A,C,G,T}, degenerate:{<code>: n} } — recuento literal,
 *  sin resolver las degeneradas (eso es "desglose de las degeneradas"). */
export function baseComposition(seq) {
  const counts = { A: 0, C: 0, G: 0, T: 0 };
  const degenerate = {};
  for (const c of seq) {
    if (counts[c] !== undefined) counts[c]++;
    else degenerate[c] = (degenerate[c] || 0) + 1;
  }
  return { length: seq.length, counts, degenerate };
}

/** % GC — para bases degeneradas usa la fracción de su set IUPAC que es G/C
 *  (probabilidad media asumiendo resoluciones equiprobables). isEstimate=true
 *  si el primer lleva alguna base degenerada. */
export function gcPercent(seq) {
  let gc = 0;
  const isEstimate = hasDegenerate(seq);
  for (const c of seq) {
    const set = IUPAC_SETS[c];
    if (!set) continue;
    gc += set.filter((b) => b === 'G' || b === 'C').length / set.length;
  }
  return { pct: seq.length ? (gc / seq.length) * 100 : 0, isEstimate };
}

/** GC clamp: ¿el último nucleótido del extremo 3' es G/C? Si es una base
 *  degenerada, da la fracción de su set que es G/C en vez de sí/no. */
export function gcClamp(seq) {
  if (!seq.length) return { status: 'none', base: '', gcFraction: 0 };
  const base = seq[seq.length - 1];
  const set = IUPAC_SETS[base] || [];
  const gcFraction = set.length ? set.filter((b) => b === 'G' || b === 'C').length / set.length : 0;
  const status = gcFraction === 1 ? 'ok' : gcFraction === 0 ? 'warn' : 'partial';
  return { status, base, gcFraction };
}

/** Peso molecular (ssDNA, 5'-OH/3'-OH libres — fórmula habitual de las
 *  calculadoras de oligos): Σ(peso de cada base) − 61.96. Para bases
 *  degeneradas usa el promedio de las bases posibles. */
export function molecularWeight(seq) {
  let mw = 0;
  const isEstimate = hasDegenerate(seq);
  for (const c of seq) {
    const set = IUPAC_SETS[c];
    if (!set) continue;
    mw += set.reduce((s, b) => s + BASE_MW[b], 0) / set.length;
  }
  return { mw: seq.length ? mw - 61.96 : 0, isEstimate };
}

/** Coeficiente de extinción ε260 (M⁻¹·cm⁻¹) por el método simple de suma de
 *  bases (no el de vecino más próximo que usan algunas calculadoras
 *  comerciales, que necesita una tabla propia no verificada aquí). */
export function extinctionCoefficient(seq) {
  let ext = 0;
  const isEstimate = hasDegenerate(seq);
  for (const c of seq) {
    const set = IUPAC_SETS[c];
    if (!set) continue;
    ext += set.reduce((s, b) => s + BASE_EXT260[b], 0) / set.length;
  }
  return { ext260: ext, isEstimate };
}

// ---- Tm por vecino más próximo (SantaLucia 1998 unificado + saltcorr 1998) ----

// Allawi & SantaLucia (1997)/SantaLucia (1998 PNAS, tabla "unificada"),
// Biochemistry 36:10581 / PNAS 95:1460. Mismos valores que DNA_NN3 en
// Bio.SeqUtils.MeltingTemp (Biopython). ΔH en kcal/mol, ΔS en cal/(mol·K).
const NN_PARAMS = {
  init: [0, 0], init_AT: [2.3, 4.1], init_GC: [0.1, -2.8],
  'AA/TT': [-7.9, -22.2], 'AT/TA': [-7.2, -20.4], 'TA/AT': [-7.2, -21.3],
  'CA/GT': [-8.5, -22.7], 'GT/CA': [-8.4, -22.4], 'CT/GA': [-7.8, -21.0],
  'GA/CT': [-8.2, -22.2], 'CG/GC': [-10.6, -27.2], 'GC/CG': [-9.8, -24.4],
  'GG/CC': [-8.0, -19.9],
};
const WC_COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' };

/** Suma ΔH/ΔS de vecino más próximo para un dúplex PERFECTAMENTE
 *  complementario de `seq` (concreta, solo ACGT) contra su propio
 *  complementario. Se reutiliza tanto para Tm como para estimar ΔG de
 *  dímeros/horquillas (primerDimers.js). */
export function nnDeltas(seqConcrete) {
  const seq = seqConcrete.toUpperCase();
  let dH = NN_PARAMS.init[0], dS = NN_PARAMS.init[1];
  const ends = seq[0] + seq[seq.length - 1];
  let AT = 0, GC = 0;
  for (const c of ends) {
    if (c === 'A' || c === 'T') AT++;
    if (c === 'G' || c === 'C') GC++;
  }
  dH += NN_PARAMS.init_AT[0] * AT; dS += NN_PARAMS.init_AT[1] * AT;
  dH += NN_PARAMS.init_GC[0] * GC; dS += NN_PARAMS.init_GC[1] * GC;
  for (let i = 0; i < seq.length - 1; i++) {
    const dinuc = seq.slice(i, i + 2);
    const complStep = WC_COMPLEMENT[dinuc[0]] + WC_COMPLEMENT[dinuc[1]];
    const key = dinuc + '/' + complStep;
    let v = NN_PARAMS[key];
    if (!v) v = NN_PARAMS[key.split('').reverse().join('')];
    if (!v) return null; // secuencia con carácter no-ACGT: no se puede evaluar
    dH += v[0]; dS += v[1];
  }
  return { dH, dS };
}

/** Tm (°C) de un dúplex perfecto para una secuencia CONCRETA (solo ACGT).
 *  Na = concentración de sal monovalente (mM), dnac1 = concentración de
 *  primer (nM, cadena mayoritaria), dnac2 = concentración de la cadena
 *  complementaria (nM; 0 = plantilla despreciable, caso habitual en PCR). */
export function tmNN(seqConcrete, { Na = 50, dnac1 = 500, dnac2 = 0 } = {}) {
  const seq = seqConcrete.toUpperCase();
  if (seq.length < 2) return NaN;
  const d = nnDeltas(seq);
  if (!d) return NaN;
  let { dH, dS } = d;
  const corr = 0.368 * (seq.length - 1) * Math.log(Na / 1000);
  dS += corr;
  const k = (dnac1 - dnac2 / 2) * 1e-9;
  const R = 1.987;
  return (1000 * dH) / (dS + R * Math.log(k)) - 273.15;
}

/** ΔG (kcal/mol) a `tempC` (37°C por defecto) del mismo dúplex perfecto,
 *  a partir de las mismas ΔH/ΔS — para puntuar dímeros/horquillas. */
export function deltaG(seqConcrete, tempC = 37) {
  const d = nnDeltas(seqConcrete);
  if (!d) return NaN;
  const T = tempC + 273.15;
  return d.dH - (T * d.dS) / 1000;
}

let seedState = 0;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXACT_COMBO_CAP = 4096;
const SAMPLE_SIZE = 512;

/** Nº de resoluciones concretas posibles de una secuencia IUPAC (producto de
 *  |set| en cada posición). */
export function degenerateCombosCount(seq) {
  let n = 1;
  for (const c of seq) n *= (IUPAC_SETS[c] || ['?']).length;
  return n;
}

/** Expande una secuencia IUPAC a variantes concretas ACGT. Si el nº total de
 *  combinaciones cabe bajo EXACT_COMBO_CAP, las da TODAS (exact:true); si no,
 *  muestrea SAMPLE_SIZE al azar con semilla fija (exact:false) — un primer
 *  real de 16S nunca debería tocar esta rama. */
export function expandVariants(seq) {
  const total = degenerateCombosCount(seq);
  if (total <= EXACT_COMBO_CAP) {
    let variants = [''];
    for (const c of seq) {
      const set = IUPAC_SETS[c] || [c];
      const next = [];
      for (const v of variants) for (const b of set) next.push(v + b);
      variants = next;
    }
    return { variants, exact: true, total };
  }
  const rand = mulberry32(0x51e57de5 + seq.length);
  const seen = new Set();
  const variants = [];
  let guard = 0;
  while (variants.length < SAMPLE_SIZE && guard < SAMPLE_SIZE * 20) {
    guard++;
    let v = '';
    for (const c of seq) {
      const set = IUPAC_SETS[c] || [c];
      v += set[Math.floor(rand() * set.length)];
    }
    if (!seen.has(v)) { seen.add(v); variants.push(v); }
  }
  return { variants, exact: false, total };
}

/** Tm de un primer (con o sin bases degeneradas). Si hay degeneradas, calcula
 *  la Tm de cada resolución concreta y da min/media/max — el "peor caso" (más
 *  bajo) es el que importa para diseño de primers universales. */
export function meltingTemp(seq, opts = {}) {
  const degenerate = hasDegenerate(seq);
  if (!degenerate) {
    const tm = tmNN(seq, opts);
    return { tm, min: tm, max: tm, mean: tm, n: 1, exact: true, isDegenerate: false };
  }
  const { variants, exact, total } = expandVariants(seq);
  const tms = variants.map((v) => tmNN(v, opts)).filter((v) => Number.isFinite(v));
  if (!tms.length) return { tm: NaN, min: NaN, max: NaN, mean: NaN, n: 0, exact, isDegenerate: true, total };
  const min = Math.min(...tms), max = Math.max(...tms);
  const mean = tms.reduce((a, b) => a + b, 0) / tms.length;
  return { tm: mean, min, max, mean, n: tms.length, exact, isDegenerate: true, total };
}

export function reverseComplementIUPAC(seq) {
  return [...seq].reverse().map((c) => IUPAC_COMPLEMENT[c] || c).join('');
}

/** ¿Pueden emparejarse (Watson-Crick) dos bases IUPAC? true si la
 *  intersección entre el complemento de `a` y el set de `b` no es vacía. */
export function iupacComplementary(a, b) {
  const compA = IUPAC_COMPLEMENT[a];
  if (!compA) return false;
  const setComp = IUPAC_SETS[compA] || [];
  const setB = IUPAC_SETS[b] || [];
  return setComp.some((x) => setB.includes(x));
}

/** ¿La base de la plantilla (posiblemente IUPAC) satisface el código del
 *  primer? Para la búsqueda de cobertura: el primer con su código IUPAC debe
 *  poder resolverse a la base concreta (o degenerada) de la referencia. */
export function iupacMatches(primerCode, templateCode) {
  const setP = IUPAC_SETS[primerCode] || [];
  const setT = IUPAC_SETS[templateCode] || [];
  return setP.some((x) => setT.includes(x));
}
