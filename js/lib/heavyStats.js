// Cliente de js/workers/statsWorker.js: corre UPGMA y las curvas de rarefacción
// fuera del hilo principal SOLO cuando el tamaño lo justifica.
//
// Por qué así (medido en tests/perf-stress.mjs, no a ojo):
//   - UPGMA es O(n³): ~40 ms a 320 muestras, ~170 ms a 520, ~325 ms a 640.
//     Por debajo de ~180 muestras ni se nota → se calcula en el hilo principal
//     y nos ahorramos el arranque del worker y el parpadeo de "calculando".
//   - Rarefacción: ~530 ms para 260 muestras × ~2800 taxones. El umbral va por
//     "trabajo" (Σ taxones no nulos × nº de muestras), no por nº de muestras.
//
// Si el worker no se puede crear (o falla), se cae al hilo principal con el
// MISMO resultado.

import { upgma, leafOrder, rarefactionCurve } from './stats.js';

const UPGMA_SYNC_MAX = 180;        // nº de muestras por debajo del cual va en el hilo principal
const RARE_SYNC_WORK = 120_000;    // Σ (taxones no nulos) por debajo del cual va en el hilo principal

let seq = 0;

function runInWorker(type, payload) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../workers/statsWorker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const id = ++seq;
    const cleanup = () => { try { worker.terminate(); } catch (e) { /* noop */ } };
    worker.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.id !== id) return;
      cleanup();
      if (m.ok) resolve(m.result);
      else reject(new Error(m.error || 'error en el worker de stats'));
    };
    worker.onerror = (ev) => { cleanup(); reject(new Error((ev && ev.message) || 'Worker error')); };
    try {
      worker.postMessage({ id, type, payload });
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

function upgmaSync(matrix, labels) {
  const tree = upgma(matrix, labels);
  return { tree, order: leafOrder(tree) };
}

/**
 * @param {number[][]} matrix  matriz de distancias cuadrada
 * @param {string[]}   labels
 * @returns {Promise<{ tree:object, order:string[] }>}
 */
export async function upgmaOrderAsync(matrix, labels) {
  if (labels.length < UPGMA_SYNC_MAX) return upgmaSync(matrix, labels);
  try {
    return await runInWorker('upgma', { matrix, labels });
  } catch (e) {
    return upgmaSync(matrix, labels);
  }
}

/**
 * @param {{ [sid:string]: number[] }} vectors  conteos por taxón de cada muestra
 * @param {number} nPoints
 * @returns {Promise<{ [sid:string]: {N,sObs,depths,richness} }>}
 */
export async function rarefactionBatchAsync(vectors, nPoints) {
  const sids = Object.keys(vectors);
  let work = 0;
  for (const sid of sids) {
    const v = vectors[sid];
    for (let i = 0; i < v.length; i++) if (v[i] > 0) work++;
  }
  if (work < RARE_SYNC_WORK) {
    const curves = {};
    for (const sid of sids) curves[sid] = rarefactionCurve(vectors[sid], nPoints);
    return curves;
  }
  try {
    const { curves } = await runInWorker('rarefaction', { vectors, nPoints });
    return curves;
  } catch (e) {
    const curves = {};
    for (const sid of sids) curves[sid] = rarefactionCurve(vectors[sid], nPoints);
    return curves;
  }
}
