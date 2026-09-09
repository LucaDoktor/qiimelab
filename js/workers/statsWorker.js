// Web Worker (módulo ES) para los dos cálculos de stats.js que bloquean el
// hilo principal con datasets grandes (medido en tests/perf-stress.mjs):
//
//   · UPGMA + orden de hojas de una matriz de distancias grande
//     (O(n³): ~170 ms a 520 muestras, ~325 ms a 640)
//   · curvas de rarefacción analíticas de muchas muestras
//     (~530 ms para 260 muestras × ~2800 taxones)
//
// El cliente (js/lib/heavyStats.js) lo usa solo por encima de un umbral de
// tamaño; por debajo calcula en el hilo principal (idéntico resultado, sin el
// coste de arrancar el worker). Si crear el worker falla, también cae al hilo
// principal.

import { upgma, leafOrder, rarefactionCurve } from '../lib/stats.js';

self.onmessage = (e) => {
  const { id, type, payload } = e.data || {};
  try {
    if (type === 'upgma') {
      const tree = upgma(payload.matrix, payload.labels);
      const order = leafOrder(tree);
      self.postMessage({ id, ok: true, result: { tree, order } });
    } else if (type === 'rarefaction') {
      const { vectors, nPoints } = payload;
      const curves = {};
      for (const sid of Object.keys(vectors)) curves[sid] = rarefactionCurve(vectors[sid], nPoints);
      self.postMessage({ id, ok: true, result: { curves } });
    } else {
      self.postMessage({ id, ok: false, error: 'tipo desconocido: ' + type });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
