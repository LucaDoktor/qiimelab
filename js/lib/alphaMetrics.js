// Deriva índices de diversidad alfa de lo que ya haya en el estado, sin pedir
// archivos nuevos:
//
//  · POR MUESTRA (para el boxplot): de la tabla de conteos taxón × muestra
//    (state.taxaCounts) salen Shannon, Simpson (1−D), Pielou (J') y Chao1.
//    Shannon/Observed solo se calculan si no hay ya un vector subido de ese
//    tipo. Sin tabla de conteos, Pielou se puede sacar dividiendo los vectores
//    de Shannon y Observed que sí estén cargados.
//
//  · POR GRUPO (tabla comparativa): estimadores de riqueza por INCIDENCIA
//    (Chao2, jackknife 1º/2º orden, bootstrap) sobre las muestras de cada
//    grupo de metadatos — son del conjunto, no de una muestra suelta.
//
// La estadística vive en stats.js y está verificada contra vegan.

import { state } from '../state.js';
import { t } from './i18n.js';
import {
  shannonIndex, simpsonIndex, pielouEvenness, observedRichness, chao1,
  incidenceRichnessEstimators,
} from './stats.js';

// nombre de métrica (normalizado) → clave i18n de la explicación de una frase
const ALPHA_EXPLAIN = [
  [/^(shannon|shannon_entropy|shannon_index|shannons?|h)$/i, 'alpha.exShannon'],
  [/^(observed|observed_features|observed_otus|observed_asvs|sobs|s_obs|richness)$/i, 'alpha.exObserved'],
  [/^(simpson|simpson_e|simpson_1md|gini_simpson|simpson_index)$/i, 'alpha.exSimpson'],
  [/^(pielou|pielou_e|pielou_evenness|evenness|j|j_prime)$/i, 'alpha.exPielou'],
  [/^(chao1|chao_1|chao)$/i, 'alpha.exChao1'],
  [/^(faith_pd|faith|pd|faiths_pd)$/i, 'alpha.exFaith'],
];

/** Devuelve la explicación llana de una métrica alfa, o null si no se reconoce. */
export function explainAlphaMetric(name) {
  const n = String(name || '').trim();
  for (const [re, key] of ALPHA_EXPLAIN) if (re.test(n)) return t(key);
  return null;
}

function alphaKind(name) {
  const n = String(name || '').trim();
  if (/^(shannon|shannon_entropy|shannon_index|shannons?|h)$/i.test(n)) return 'shannon';
  if (/^(observed|observed_features|observed_otus|observed_asvs|sobs|s_obs|richness)$/i.test(n)) return 'observed';
  if (/^(pielou|pielou_e|pielou_evenness|evenness|j|j_prime)$/i.test(n)) return 'pielou';
  if (/^(simpson|simpson_e|simpson_1md|gini_simpson|simpson_index)$/i.test(n)) return 'simpson';
  if (/^(chao1|chao_1|chao)$/i.test(n)) return 'chao1';
  return null;
}

// conteos por muestra a partir de state.taxaCounts → { sampleIds, vectors }
function countVectors(tc) {
  const taxonKey = tc.taxonKey || tc.headers[0];
  const sampleIds = tc.headers.filter((h) => h !== taxonKey);
  const vectors = {};
  sampleIds.forEach((s) => { vectors[s] = []; });
  tc.rows.forEach((r) => {
    sampleIds.forEach((s) => { vectors[s].push(parseFloat(r[s]) || 0); });
  });
  return { sampleIds, vectors };
}

const COMPUTED_ORDER = ['shannon', 'observed', 'simpson', 'pielou', 'chao1'];
const COMPUTED_FN = {
  shannon: shannonIndex,
  observed: observedRichness,
  simpson: simpsonIndex,
  pielou: (v) => pielouEvenness(v),
  chao1: chao1,
};

// Pielou de dos vectores subidos: J = H / log_b(S). El Shannon de QIIME 2 va en
// log2, así que se detecta la base (la que deje J ≤ 1) antes de dividir.
function pielouFromVectors() {
  if (!state.alphaDiversity) return null;
  let shan = null, obs = null;
  for (const [name, m] of Object.entries(state.alphaDiversity.metrics)) {
    const k = alphaKind(name);
    if (k === 'shannon' && !shan) shan = m.values;
    else if (k === 'observed' && !obs) obs = m.values;
  }
  if (!shan || !obs) return null;
  const pairs = [];
  Object.keys(shan).forEach((sid) => {
    const h = shan[sid], s = obs[sid];
    if (typeof h === 'number' && isFinite(h) && h >= 0 && typeof s === 'number' && s >= 2) pairs.push([sid, h, s]);
  });
  if (!pairs.length) return null;
  const maxJln = Math.max(...pairs.map(([, h, s]) => h / Math.log(s)));
  const base = maxJln <= 1.0001 ? Math.E : 2;   // e = Shannon natural; 2 = QIIME 2
  const out = {};
  pairs.forEach(([sid, h, s]) => { out[sid] = h / (Math.log(s) / Math.log(base)); });
  return out;
}

/**
 * Lista de métricas alfa disponibles para el boxplot.
 * @returns {Array<{name, label, explain, values:Object, computed:boolean}>}
 */
export function collectAlphaMetrics() {
  const list = [];
  const uploadedKinds = new Set();

  if (state.alphaDiversity) {
    for (const [name, m] of Object.entries(state.alphaDiversity.metrics)) {
      const k = alphaKind(name);
      if (k) uploadedKinds.add(k);
      list.push({ name, label: name, explain: explainAlphaMetric(name), values: m.values, computed: false });
    }
  }

  if (state.taxaCounts) {
    const { sampleIds, vectors } = countVectors(state.taxaCounts);
    COMPUTED_ORDER.forEach((kind) => {
      // Shannon y Observed: no dupliques si ya hay un vector subido de ese tipo
      if ((kind === 'shannon' || kind === 'observed') && uploadedKinds.has(kind)) return;
      const fn = COMPUTED_FN[kind];
      const values = {};
      sampleIds.forEach((s) => { values[s] = fn(vectors[s]); });
      list.push({ name: kind, label: t('alpha.m_' + kind), explain: t('alpha.ex' + kind[0].toUpperCase() + kind.slice(1)), values, computed: true });
    });
  } else if (!uploadedKinds.has('pielou')) {
    const pj = pielouFromVectors();
    if (pj) list.push({ name: 'pielou', label: t('alpha.m_pielou'), explain: t('alpha.exPielou'), values: pj, computed: true });
  }

  return list;
}

// muestra → grupo, tolerante a sufijos en los IDs (A-1 ↔ A-1-16S-…)
function groupResolver(meta, groupCol) {
  const map = {};
  meta.rows.forEach((r) => {
    const id = String(r[meta.sampleIdKey] ?? '').trim();
    const g = String(r[groupCol] ?? '').trim();
    if (id && g) map[id] = g;
  });
  return (sid) => {
    if (map[sid] != null) return map[sid];
    const hit = Object.keys(map).find((k) => sid.startsWith(k) || k.startsWith(sid));
    return hit ? map[hit] : null;
  };
}

export const RICHNESS_ESTIMATORS = [
  { key: 'sObs', label: 'S obs.', ex: 'alpha.exSobsGroup' },
  { key: 'chao2', se: 'chao2SE', label: 'Chao2', ex: 'alpha.exChao2' },
  { key: 'jack1', se: 'jack1SE', label: 'Jackknife 1', ex: 'alpha.exJack1' },
  { key: 'jack2', label: 'Jackknife 2', ex: 'alpha.exJack2' },
  { key: 'boot', se: 'bootSE', label: 'Bootstrap', ex: 'alpha.exBoot' },
];

/**
 * Estimadores de riqueza por incidencia para cada grupo de `groupCol`.
 * @returns {null | Array<{group, n, sObs, chao2, chao2SE, jack1, jack1SE, jack2, boot, bootSE}>}
 */
export function groupRichnessEstimators(groupCol) {
  if (!state.taxaCounts || !state.metadata || !groupCol) return null;
  const tc = state.taxaCounts;
  const taxonKey = tc.taxonKey || tc.headers[0];
  const sampleCols = tc.headers.filter((h) => h !== taxonKey);
  // matriz taxón-mayor: taxa[t][s]
  const taxa = tc.rows.map((r) => sampleCols.map((s) => parseFloat(r[s]) || 0));

  const resolve = groupResolver(state.metadata, groupCol);
  const groups = {};
  sampleCols.forEach((s, si) => {
    const g = resolve(s);
    if (g == null || g === '') return;
    (groups[g] = groups[g] || []).push(si);
  });
  const names = Object.keys(groups).sort();
  if (names.length === 0) return [];
  return names.map((g) => {
    const sIdx = groups[g];
    const siteBySpecies = sIdx.map((si) => taxa.map((tv) => tv[si]));
    return { group: g, ...incidenceRichnessEstimators(siteBySpecies) };
  });
}
