// Linter de accesibilidad para paletas de color de gráficos: distancia
// perceptual en OKLab, simulación de dicromacia (protanopía/deuteranopía/
// tritanopía, Machado, Oliveira & Fernandes 2009) y contraste WCAG contra el
// fondo de la figura (claro y oscuro). Sin dependencias.
//
// Mismos métodos y umbrales que ya usan tests/cvd.mjs y tests/contrast.mjs
// (para que "verificado en tests/" y "verificado en vivo en el editor" digan
// lo mismo) — la diferencia es que aquellos leen css/tokens.css y este
// trabaja con hex sueltos, para poder juzgar CUALQUIER color que teclee el
// usuario en el editor de gráficos, no solo los tokens ya fijados.

// ---- conversión de color ----

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function isValidHex(hex) {
  return hexToRgb(hex) !== null;
}

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const toUnit = (rgb) => rgb.map((v) => v / 255);

// ---- OKLab (Björn Ottosson) — misma fórmula que tests/cvd.mjs ----

function oklabFromUnit([r, g, b]) {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

/** OKLab [L, a, b] de un color hex — L≈0 (negro) .. L≈1 (blanco). */
export function oklab(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? oklabFromUnit(toUnit(rgb)) : null;
}

/** Distancia perceptual entre dos hex, en la misma escala ×100 que usa
 *  tests/cvd.mjs (para que los umbrales PASS/WARN/FAIL sean los mismos). */
export function deltaE(hexA, hexB) {
  const a = oklab(hexA), b = oklab(hexB);
  if (!a || !b) return NaN;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
}

// ---- simulación de dicromacia — Machado, Oliveira & Fernandes (2009), severidad 1.0 ----
// Mismas matrices que tests/cvd.mjs.

const CVD_MATRICES = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuter: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968609]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
export const CVD_TYPES = Object.keys(CVD_MATRICES);

function mulM(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

// versión en coma flotante (0..1, sin cuantizar a hex) — es la que se usa
// para medir ΔE, para no perder precisión redondeando de más.
function simulateCVDUnit(unit, type) {
  const M = CVD_MATRICES[type];
  if (!M) return unit;
  return mulM(M, unit.map(s2l)).map((c) => clamp01(l2s(clamp01(c))));
}

/** Hex tal como lo vería alguien con esa dicromacia. `type`: 'protan'|'deuter'|'tritan'.
 *  Para previsualizar en la UI; los cálculos de ΔE usan la versión sin cuantizar. */
export function simulateCVD(hex, type) {
  const rgb = hexToRgb(hex);
  if (!CVD_MATRICES[type] || !rgb) return hex;
  return rgbToHex(simulateCVDUnit(toUnit(rgb), type).map((v) => v * 255));
}

// ---- contraste WCAG (misma fórmula que tests/contrast.mjs) ----

const srgbToLin255 = (c) => s2l(c / 255);
function relLuminance(rgb) {
  const [r, g, b] = rgb;
  return 0.2126 * srgbToLin255(r) + 0.7152 * srgbToLin255(g) + 0.0722 * srgbToLin255(b);
}

/** Ratio de contraste WCAG entre dos hex (1 .. 21). */
export function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  if (!a || !b) return NaN;
  const L1 = relLuminance(a), L2 = relLuminance(b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- umbrales (mismos que tests/cvd.mjs / tests/contrast.mjs) ----

/** ΔE OKLab (visión normal o simulada): <8 = indistinguibles, <15 = aviso. */
export const DELTA_E_FAIL = 8;
export const DELTA_E_WARN = 15;
/** Contraste contra el fondo (marca gráfica, no texto — WCAG 1.4.11 = 3:1). */
export const CONTRAST_FAIL = 2;
export const CONTRAST_WARN = 3;

/** Fondos de figura por defecto — mismos hex que --surface en css/tokens.css. */
export const DEFAULT_BG = { light: '#fcfcfb', dark: '#1a1a19' };

function verdictOf(value, failBelow, warnBelow) {
  if (!Number.isFinite(value)) return 'FAIL';
  if (value < failBelow) return 'FAIL';
  if (value < warnBelow) return 'WARN';
  return 'PASS';
}

/** Peor de dos veredictos ('FAIL' > 'WARN' > 'PASS'). */
export function worseVerdict(a, b) {
  const order = { PASS: 0, WARN: 1, FAIL: 2 };
  return order[a] >= order[b] ? a : b;
}

// ---- API de alto nivel ----

/** Compara dos colores: distancia en visión normal + las 3 dicromacias.
 *  Igual que el GATE de tests/cvd.mjs (ΔE < 8 bloquea, < 15 avisa). */
export function comparePair(hexA, hexB) {
  const rgbA = hexToRgb(hexA), rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) {
    const bad = { normal: NaN, protan: NaN, deuter: NaN, tritan: NaN };
    return { deltaE: bad, worst: NaN, worstType: 'normal', verdict: 'FAIL' };
  }
  const unitA = toUnit(rgbA), unitB = toUnit(rgbB);
  const deltaEs = { normal: deltaE(hexA, hexB) };
  CVD_TYPES.forEach((type) => {
    const a = oklabFromUnit(simulateCVDUnit(unitA, type));
    const b = oklabFromUnit(simulateCVDUnit(unitB, type));
    deltaEs[type] = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
  });
  let worstType = 'normal', worst = deltaEs.normal;
  for (const k of Object.keys(deltaEs)) if (deltaEs[k] < worst) { worst = deltaEs[k]; worstType = k; }
  return { deltaE: deltaEs, worst, worstType, verdict: verdictOf(worst, DELTA_E_FAIL, DELTA_E_WARN) };
}

/** Contraste de un color contra los fondos claro y oscuro de la figura. */
export function backgroundContrast(hex, bg = DEFAULT_BG) {
  const light = contrastRatio(hex, bg.light);
  const dark = contrastRatio(hex, bg.dark);
  return {
    light, dark,
    verdict: worseVerdict(verdictOf(light, CONTRAST_FAIL, CONTRAST_WARN), verdictOf(dark, CONTRAST_FAIL, CONTRAST_WARN)),
  };
}

/**
 * Linter completo de una paleta: todas las parejas (distinguibilidad, en
 * visión normal y las 3 dicromacias) + contraste de cada color contra el
 * fondo claro/oscuro. `colors`: array de hex.
 */
export function validatePalette(colors, bg = DEFAULT_BG) {
  const perColor = colors.map((hex) => ({ hex, contrast: backgroundContrast(hex, bg) }));
  const pairs = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      pairs.push({ i, j, a: colors[i], b: colors[j], ...comparePair(colors[i], colors[j]) });
    }
  }
  let verdict = 'PASS';
  perColor.forEach((c) => { verdict = worseVerdict(verdict, c.contrast.verdict); });
  pairs.forEach((p) => { verdict = worseVerdict(verdict, p.verdict); });
  return { colors: perColor, pairs, verdict };
}

/**
 * Para el aviso en vivo del editor: ¿el hex que se acaba de teclear choca con
 * alguno de los OTROS colores ya usados en este gráfico? Devuelve el peor
 * choque encontrado (o null si no hay ninguno) — no bloquea, solo informa.
 */
export function checkAgainstPalette(hex, others) {
  if (!isValidHex(hex)) return { verdict: 'FAIL', reason: 'invalid', worstIndex: -1 };
  const contrast = backgroundContrast(hex);
  let worst = { verdict: contrast.verdict, reason: 'contrast', worstIndex: -1, other: null };
  others.forEach((otherHex, idx) => {
    if (!otherHex || otherHex === hex) return;
    const cmp = comparePair(hex, otherHex);
    if (worseVerdict(worst.verdict, cmp.verdict) === cmp.verdict && cmp.verdict !== worst.verdict) {
      worst = { verdict: cmp.verdict, reason: 'clash', worstIndex: idx, other: otherHex, deltaE: cmp.worst, worstType: cmp.worstType };
    } else if (cmp.verdict === worst.verdict && worst.reason !== 'clash' && cmp.verdict !== 'PASS') {
      worst = { verdict: cmp.verdict, reason: 'clash', worstIndex: idx, other: otherHex, deltaE: cmp.worst, worstType: cmp.worstType };
    }
  });
  return worst;
}
