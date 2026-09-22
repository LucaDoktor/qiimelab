// colorScale.js — escala de color continua compartida por los 3 heatmaps de
// la app (betaDiversity.js, correlogram.js, differentialAbundance.js —
// Paso 1 de qiimelab-prompt-editor-fase-3-heatmaps-escalas-continuas.md).
// Sustituye a los `color-mix()` de CSS que cada uno reimplementaba a mano:
// interpola en espacio OKLab (perceptualmente uniforme, ver
// js/lib/paletteValidator.js oklab/oklabToHex) en vez de RGB lineal, así
// que una rampa de 2 colores muy distintos no pasa por un gris sucio a
// mitad de camino como sí le pasa a `color-mix(in srgb, …)`.
//
// Sin dependencias del DOM — pura, testable en Node (ver tests/colorscale.mjs).

import { oklab, oklabToHex, isValidHex } from './paletteValidator.js';
import { SEQUENTIAL, DIVERGENT } from './palettes.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function mixOklab(hexA, hexB, t) {
  const a = oklab(hexA), b = oklab(hexB);
  if (!a || !b) return isValidHex(hexA) ? hexA : (isValidHex(hexB) ? hexB : '#888888');
  return oklabToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t));
}

/** `range` de un tipo 'sequential': array de >=2 hex (2 polos, o cualquier
 *  paleta continua del catálogo de la Fase 2 con más paradas — viridis,
 *  YlOrRd…). Sin `range` válido, la rampa de 5 paradas ya validada de
 *  palettes.js. */
function normalizeSequentialColors(range) {
  if (Array.isArray(range) && range.filter(isValidHex).length >= 2) return range.filter(isValidHex);
  return SEQUENTIAL;
}

/** `range` de un tipo 'divergent': array de >=2 hex (impar → el del medio
 *  es la parada del punto medio; par → se inserta una parada intermedia
 *  interpolada en OKLab, para que SIEMPRE haya un color exacto anclado en
 *  `midpoint`) o `{neg, mid, pos}` (formato legado, DIVERGENT de
 *  palettes.js). Cualquier paleta divergente del catálogo de la Fase 2
 *  (coolwarm, RdBu…) vale tal cual como array. */
function normalizeDivergentColors(range) {
  let colors;
  if (Array.isArray(range) && range.filter(isValidHex).length >= 2) colors = range.filter(isValidHex);
  else if (range && (isValidHex(range.neg) || isValidHex(range.pos))) {
    colors = [range.neg || DIVERGENT.neg, range.mid || DIVERGENT.mid, range.pos || DIVERGENT.pos];
  } else {
    colors = [DIVERGENT.neg, DIVERGENT.mid, DIVERGENT.pos];
  }
  if (colors.length % 2 === 0) {
    const mid = colors.length / 2;
    colors = [...colors.slice(0, mid), mixOklab(colors[mid - 1], colors[mid], 0.5), ...colors.slice(mid)];
  }
  return colors;
}

/** Coloca `colors` (impar, centro en `midpoint`) como paradas en posición
 *  [0,1] del dominio: la mitad izquierda equiespaciada en [0, midT], la
 *  derecha en [midT, 1] — así una paleta de 11 tonos (no solo 3) respeta
 *  igual de bien un punto medio no centrado (dominio asimétrico). */
function divergentStops(colors, midT) {
  const m = (colors.length - 1) / 2;
  const stops = [];
  for (let i = 0; i <= m; i++) stops.push({ pos: m === 0 ? midT : (i / m) * midT, color: colors[i] });
  for (let i = 0; i < m; i++) {
    const k = i + 1;
    stops.push({ pos: midT + (k / m) * (1 - midT), color: colors[m + k] });
  }
  return stops;
}

function sequentialStops(colors) {
  const n = colors.length;
  return colors.map((color, i) => ({ pos: n === 1 ? 0 : i / (n - 1), color }));
}

function colorAtT(stops, t) {
  const tc = clamp01(t);
  if (tc <= stops[0].pos) return stops[0].color;
  const last = stops[stops.length - 1];
  if (tc >= last.pos) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (tc >= a.pos && tc <= b.pos) {
      const localT = b.pos === a.pos ? 0 : (tc - a.pos) / (b.pos - a.pos);
      return mixOklab(a.color, b.color, localT);
    }
  }
  return last.color; // inalcanzable salvo error de redondeo; red de seguridad
}

/**
 * @param {object} o
 * @param {'sequential'|'divergent'} [o.type='sequential']
 * @param {[number, number]} [o.domain=[0,1]]  rango real de los datos —
 *        editable desde el panel (Paso 3): recortar outliers, por ejemplo.
 * @param {Array|{neg,mid,pos}} [o.range]  colores — ver
 *        normalizeSequentialColors/normalizeDivergentColors.
 * @param {number} [o.midpoint=0]  solo 'divergent': valor de dato que cae
 *        en el color central del rango, con independencia de dónde quede
 *        dentro de [domain[0], domain[1]] (no fuerza el centro geométrico).
 * @param {number} [o.steps=0]  0/null = rampa continua; entero = discretiza
 *        en N bandas (color del CENTRO de cada banda, no el de su borde).
 * @param {boolean} [o.invert=false]  invierte qué color cae en qué extremo
 *        del dominio, sin tocar las posiciones de las paradas.
 * @returns {{
 *   scale: (value:number) => (string|null),
 *   legendStops: Array<{offset:number, color:string}>,
 *   type: string, domain: [number,number], midpoint: (number|null),
 *   steps: number, invert: boolean, colorAt: (t:number) => string,
 * }}
 */
export function makeColorScale(o = {}) {
  const type = o.type === 'divergent' ? 'divergent' : 'sequential';
  const domain = Array.isArray(o.domain) && o.domain.length === 2 && o.domain.every(Number.isFinite)
    ? o.domain : [0, 1];
  const [dMin, dMax] = domain;
  const midpoint = type === 'divergent' ? (Number.isFinite(o.midpoint) ? o.midpoint : 0) : null;
  const steps = Number.isFinite(o.steps) && o.steps > 0 ? Math.round(o.steps) : 0;
  const invert = !!o.invert;

  let stops = type === 'divergent'
    ? divergentStops(normalizeDivergentColors(o.range), dMax === dMin ? 0.5 : clamp01((midpoint - dMin) / (dMax - dMin)))
    : sequentialStops(normalizeSequentialColors(o.range));
  if (invert) {
    const colors = stops.map((s) => s.color).reverse();
    stops = stops.map((s, i) => ({ pos: s.pos, color: colors[i] }));
  }

  function colorAt(t) {
    if (steps <= 0) return colorAtT(stops, t);
    const bandIdx = Math.min(steps - 1, Math.max(0, Math.floor(clamp01(t) * steps)));
    return colorAtT(stops, (bandIdx + 0.5) / steps);
  }

  function scale(value) {
    if (!Number.isFinite(value)) return null; // "sin dato": quien llama decide el color de reserva
    const t = dMax === dMin ? 0.5 : (value - dMin) / (dMax - dMin);
    return colorAt(t);
  }

  // paradas de leyenda: en modo continuo, se MUESTREAN muchos puntos
  // (no solo los 2-3 anclas) porque un <linearGradient> de SVG interpola en
  // RGB plano entre <stop> consecutivos — sin este muestreo denso, la
  // leyenda dejaría de ser perceptualmente uniforme aunque scale() sí lo
  // sea. En modo discreto, dos <stop> por banda al mismo offset (borde
  // duro) reproducen las bandas reales que pinta scale().
  const LEGEND_SAMPLES = 32;
  let legendStops;
  if (steps <= 0) {
    legendStops = Array.from({ length: LEGEND_SAMPLES + 1 }, (_, i) => {
      const t = i / LEGEND_SAMPLES;
      return { offset: t * 100, color: colorAtT(stops, t) };
    });
  } else {
    legendStops = [];
    for (let b = 0; b < steps; b++) {
      const color = colorAtT(stops, (b + 0.5) / steps);
      legendStops.push({ offset: (b / steps) * 100, color });
      legendStops.push({ offset: ((b + 1) / steps) * 100, color });
    }
  }

  return { scale, legendStops, type, domain, midpoint, steps, invert, colorAt, stops };
}
