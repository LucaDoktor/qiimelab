// Recuento microbiano (placa: UFC/mL; NMP: NMP/mL). Agrupa las filas de
// réplica que comparten las columnas de agrupación y resume cada grupo en
// log10: n, media, desviación típica (muestral, n−1) y error estándar (SD/√n).
//
// Compartido por el módulo #/recuentos y verificado número a número contra R
// (mean / sd) en tests/stats/countsummary.mjs.

import { mean, stdDev, standardError } from './stats.js';

const SEP = ' › '; // "a › b › c" para la clave de grupo legible

function toNumber(v) {
  const s = String(v == null ? '' : v).trim().replace(',', '.');
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {object} series  { headers, rows, mapping:{ groupCols:number[], valueCol:number, dilutionCol:?number, alreadyLog:boolean } }
 * @returns {{
 *   groupColNames: string[],
 *   valueName: string,
 *   groups: Array<{ key:string, labels:string[], n:number, values:number[], meanLog:number, sd:number, se:number }>,
 *   excluded: number,     // celdas 0 / negativas / no numéricas descartadas
 *   totalRows: number,
 *   modeN: number,        // n más frecuente entre los grupos
 *   unevenN: boolean,     // algún grupo con n distinto de modeN
 * }}
 */
export function summariseCountSeries(series) {
  const { headers, rows, mapping } = series;
  const groupColNames = (mapping.groupCols || []).map((i) => headers[i]).filter((h) => h != null);
  const vCol = headers[mapping.valueCol];
  const dCol = mapping.dilutionCol != null ? headers[mapping.dilutionCol] : null;
  const alreadyLog = !!mapping.alreadyLog;

  const map = new Map();
  let excluded = 0;

  (rows || []).forEach((r) => {
    const labels = groupColNames.map((c) => String(r[c] ?? '').trim());
    const key = labels.join(SEP) || '—';
    let g = map.get(key);
    if (!g) { g = { key, labels, values: [] }; map.set(key, g); }

    let val = toNumber(r[vCol]);
    if (dCol) {
      const d = toNumber(r[dCol]);
      if (Number.isFinite(d) && d !== 0) val = val * d;
    }
    if (!Number.isFinite(val)) { excluded++; return; }           // #NUM! / vacío / texto
    if (alreadyLog) {
      if (val < 0) { excluded++; return; }                       // un "log UFC" negativo es un error
      g.values.push(val);
    } else {
      if (val <= 0) { excluded++; return; }                      // no se puede log10 de 0 o negativo
      g.values.push(Math.log10(val));
    }
  });

  const groups = [...map.values()].map((g) => ({
    key: g.key,
    labels: g.labels,
    n: g.values.length,
    values: g.values,
    meanLog: g.values.length ? mean(g.values) : NaN,
    sd: stdDev(g.values),
    se: standardError(g.values),
  }));

  // n más frecuente (moda) entre los grupos NO vacíos
  const counts = {};
  groups.forEach((g) => { if (g.n > 0) counts[g.n] = (counts[g.n] || 0) + 1; });
  let modeN = 0, best = -1;
  Object.keys(counts).forEach((k) => { if (counts[k] > best) { best = counts[k]; modeN = +k; } });
  const unevenN = groups.some((g) => g.n > 0 && g.n !== modeN);

  return {
    groupColNames,
    valueName: vCol,
    groups,
    excluded,
    totalRows: (rows || []).length,
    modeN,
    unevenN,
  };
}

/**
 * Reparte las filas de una serie según `mapping.facetCol` (una columna
 * EXTRA de agrupación, distinta de `groupCols`: no combina réplicas, sino
 * que separa el análisis entero — barras + ANOVA/LSD — en un bloque por
 * cada valor distinto, igual que "agrupar por" en diversidad alfa/beta).
 * Sin `facetCol`, devuelve la serie tal cual en un único bloque
 * (`level: null`) — mismo comportamiento que antes de que existiera esto.
 * @param {object} series { headers, rows, mapping:{ facetCol:?number, ... } }
 * @returns {Array<{ level: string|null, series: object }>}
 */
export function splitByFacet(series) {
  const { headers, rows, mapping } = series;
  const fc = mapping.facetCol;
  if (fc == null || !headers[fc]) return [{ level: null, series }];
  const col = headers[fc];
  const map = new Map();
  (rows || []).forEach((r) => {
    const level = String(r[col] ?? '').trim() || '—';
    if (!map.has(level)) map.set(level, []);
    map.get(level).push(r);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([level, rs]) => ({ level, series: { ...series, rows: rs } }));
}
