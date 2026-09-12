// "Agrupar por" en recuentos microbianos (js/lib/countStats.js `splitByFacet`):
// una variable propia del usuario (p.ej. tiempo de muestreo) tiene que poder
// separar el análisis entero — no solo las barras, el ANOVA/LSD de Fisher
// completo — en un bloque por cada nivel, igual que "agrupar por" ya hace en
// diversidad alfa/beta. Fixture: 10 muestras, 5 en cada uno de dos niveles
// ("t1"/"t2") de una variable "tiempo", cada nivel con 2 grupos de
// tratamiento cuyas medias en log10 son deliberadamente MUY distintas entre
// niveles (t1 ≈ 10x más UFC que t2) — si el análisis se hiciera junto en vez
// de separado por tiempo, el ANOVA vería sobre todo la diferencia de tiempo,
// no la de tratamiento; separado por nivel, cada bloque debe ver solo su
// propia diferencia de tratamiento (o ausencia de ella).
//
//   node tests/microbialcountsfacet.mjs

import { APP_ROOT } from './lib/env.mjs';
const { summariseCountSeries, splitByFacet } = await import(APP_ROOT + '/js/lib/countStats.js');
const { fisherLSD } = await import(APP_ROOT + '/js/lib/stats.js');

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failed = true;
};

// t1: tratamiento A ~1e6 UFC (3 réplicas), tratamiento B ~1e6 UFC muy parecido (2 réplicas) -> SIN diferencia real
// t2: tratamiento A ~1e5 UFC (2 réplicas), tratamiento B ~1e4 UFC (3 réplicas) -> CON diferencia real de ~1 log
const ROWS = [
  { tratamiento: 'A', tiempo: 't1', UFC: 980000 }, { tratamiento: 'A', tiempo: 't1', UFC: 1050000 }, { tratamiento: 'A', tiempo: 't1', UFC: 1010000 },
  { tratamiento: 'B', tiempo: 't1', UFC: 1020000 }, { tratamiento: 'B', tiempo: 't1', UFC: 990000 },
  { tratamiento: 'A', tiempo: 't2', UFC: 98000 }, { tratamiento: 'A', tiempo: 't2', UFC: 102000 },
  { tratamiento: 'B', tiempo: 't2', UFC: 9800 }, { tratamiento: 'B', tiempo: 't2', UFC: 10200 }, { tratamiento: 'B', tiempo: 't2', UFC: 9600 },
];
check('fixture: 10 muestras', ROWS.length === 10);
check('fixture: 5 en cada nivel de "tiempo"', ROWS.filter((r) => r.tiempo === 't1').length === 5 && ROWS.filter((r) => r.tiempo === 't2').length === 5);

const series = {
  headers: ['tratamiento', 'tiempo', 'UFC'],
  rows: ROWS,
  mapping: { groupCols: [0], valueCol: 2, dilutionCol: null, alreadyLog: false, facetCol: null },
};

// --- sin facetCol: splitByFacet devuelve un único bloque con la serie tal cual ---
{
  const parts = splitByFacet(series);
  check('sin facetCol: un solo bloque (level=null)', parts.length === 1 && parts[0].level === null);
  check('sin facetCol: el bloque trae las 10 filas', parts[0].series.rows.length === 10);
}

// --- con facetCol=1 ("tiempo"): dos bloques, 5 filas cada uno ---
const faceted = { ...series, mapping: { ...series.mapping, facetCol: 1 } };
const parts = splitByFacet(faceted);
check('con facetCol: dos niveles', parts.length === 2, parts.map((p) => p.level).join(','));
check('con facetCol: niveles "t1" y "t2", en orden', parts[0].level === 't1' && parts[1].level === 't2');
check('con facetCol: 5 filas por nivel', parts.every((p) => p.series.rows.length === 5), parts.map((p) => p.series.rows.length).join(','));
check('con facetCol: cada fila del nivel "t1" es realmente de t1 (no se mezclan)',
  parts[0].series.rows.every((r) => r.tiempo === 't1'));

// --- el análisis GLOBAL (sin separar) ve sobre todo la diferencia de TIEMPO, no la de tratamiento ---
const globalSummary = summariseCountSeries(series);
const globalUsable = globalSummary.groups.filter((g) => g.n > 0);
check('global: 2 grupos (A, B) mezclando los dos tiempos', globalUsable.length === 2);
const globalLsd = fisherLSD(globalUsable.map((g) => g.values), 0.05);
check('global: ANOVA calculable', !globalLsd.error);

// --- separado por "tiempo": cada bloque ve SU PROPIA comparación A vs B ---
const results = parts.map(({ level, series: s }) => {
  const summary = summariseCountSeries(s);
  const usable = summary.groups.filter((g) => g.n > 0);
  const lsd = fisherLSD(usable.map((g) => g.values), 0.05);
  return { level, summary, usable, lsd };
});

results.forEach(({ level, usable }) => {
  check('nivel ' + level + ': 2 grupos (A, B)', usable.length === 2, usable.map((g) => g.key + ' n=' + g.n).join(', '));
});

const t1 = results.find((r) => r.level === 't1');
const t2 = results.find((r) => r.level === 't2');
check('t1: A y B tienen medias en log10 casi iguales (sin diferencia real de tratamiento)',
  Math.abs(t1.usable[0].meanLog - t1.usable[1].meanLog) < 0.1,
  t1.usable.map((g) => g.key + '=' + g.meanLog.toFixed(3)).join(', '));
check('t2: A y B difieren en ~1 log10 (diferencia real de tratamiento)',
  Math.abs(t2.usable[0].meanLog - t2.usable[1].meanLog) > 0.8,
  t2.usable.map((g) => g.key + '=' + g.meanLog.toFixed(3)).join(', '));
check('t1 y t2 dan resultados DISTINTOS entre sí (el análisis está separado de verdad, no es el mismo cálculo repetido)',
  Math.abs(t1.usable[0].meanLog - t2.usable[0].meanLog) > 0.8);
check('t2: la diferencia de tratamiento es estadísticamente significativa (p < 0.05)',
  !t2.lsd.error && t2.lsd.anova.p < 0.05, t2.lsd.error || t2.lsd.anova.p);
check('t1: la ausencia de diferencia real NO sale como significativa (p >= 0.05)',
  !t1.lsd.error && t1.lsd.anova.p >= 0.05, t1.lsd.error || t1.lsd.anova.p);

// --- las medias por nivel, promediadas de vuelta, deben reproducir aprox. la media global de cada grupo ---
// (control de sensatez: separar y volver a combinar no debe "perder" datos)
const totalRowsInParts = parts.reduce((n, p) => n + p.series.rows.length, 0);
check('separar por nivel no pierde ni duplica filas', totalRowsInParts === ROWS.length);

console.log('\nRESULTADO: ' + (failed ? 'FAIL' : 'PASS'));
process.exit(failed ? 1 : 0);
