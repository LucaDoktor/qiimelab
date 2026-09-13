// Web Worker (módulo ES) para el alineamiento local Smith-Waterman por pares.
// Ejecuta el cómputo intensivo de programación dinámica fuera del hilo principal de la UI.

import { smithWaterman, formatAlignment } from '../lib/aligner.js';

// Compatible con el contexto global de Web Worker en navegadores (self)
// y entornos de prueba / Node.js
const ctx = typeof self !== 'undefined' ? self : globalThis;

ctx.onmessage = (e) => {
  const data = (e && e.data) || {};
  const id = data.id;
  const type = data.type || 'align';
  const payload = data.payload || data;

  const seqA = payload.seqA ?? data.seqA;
  const seqB = payload.seqB ?? data.seqB;
  const options = payload.options ?? data.options ?? {};

  try {
    if (type === 'format') {
      const resultObj = payload.result || smithWaterman(seqA, seqB, options);
      const text = formatAlignment(resultObj, options);
      ctx.postMessage({ id, ok: true, type: 'done', result: text });
      return;
    }

    if (typeof seqA !== 'string' || typeof seqB !== 'string') {
      throw new TypeError('Las secuencias seqA y seqB deben ser cadenas de texto');
    }

    const result = smithWaterman(seqA, seqB, options);
    ctx.postMessage({ id, ok: true, type: 'done', result });
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      type: 'error',
      error: err && err.message ? err.message : String(err),
    });
  }
};
