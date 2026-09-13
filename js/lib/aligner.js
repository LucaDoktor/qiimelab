// Motor de alineamiento local Smith-Waterman con penalización afín por huecos
// (algoritmo de Gotoh, 1982).
//
// Implementación en Vanilla JS puro optimizada con TypedArrays (Float64Array y Uint8Array),
// sin dependencias externas.
//
// Modelo matemático:
//   - Puntuación local (Smith-Waterman, 1981): las celdas negativas se truncan a 0,
//     permitiendo identificar el alineamiento local de máxima puntuación entre dos
//     subcadenas arbitrarias sin penalizar regiones flanqueantes no homólogas.
//   - Penalización afín por huecos (Gotoh, 1982):
//       costo(k) = gapOpen + k × gapExtend   (estándar BLAST / NCBI)
//     Opcionalmente si gapOpenIncludesExtend === false:
//       costo(k) = gapOpen + (k - 1) × gapExtend (estándar Biopython / EMBOSS)
//   - 3 capas de programación dinámica:
//       H[i, j]: puntuación óptima del alineamiento local que termina en (i, j).
//       E[i, j]: mejor alineamiento terminando con hueco en B (deleción en B / base en A).
//       F[i, j]: mejor alineamiento terminando con hueco en A (inserción en B / base en B).
//   - Matriz de traza (Uint8Array compacto de 4 bits por celda):
//       bits 0-1 (hSource): 0=STOP(<=0), 1=M(diagonal), 2=E(vertical), 3=F(horizontal)
//       bit 2    (eSource): 0=OPEN(desde H), 1=EXTEND(desde E)
//       bit 3    (fSource): 0=OPEN(desde H), 1=EXTEND(desde F)

const NEG_INF = -1e12;

export const DEFAULT_ALIGN_OPTS = Object.freeze({
  match: 2,
  mismatch: -1,
  gapOpen: 3,
  gapExtend: 1,
  caseSensitive: false,
  gapOpenIncludesExtend: true,
});

/**
 * Ejecuta el algoritmo de Smith-Waterman con penalización afín por huecos
 * y reconstruye mediante backtracking el alineamiento local óptimo.
 *
 * @param {string} seqA - Primera secuencia (query)
 * @param {string} seqB - Segunda secuencia (target/referencia)
 * @param {Object} [opts] - Parámetros de puntuación y opciones
 * @param {number} [opts.match=2] - Puntuación por coincidencia de bases
 * @param {number} [opts.mismatch=-1] - Penalización por desajuste (negativo o positivo normalizado)
 * @param {number} [opts.gapOpen=3] - Penalización por apertura de hueco
 * @param {number} [opts.gapExtend=1] - Penalización por extensión de hueco
 * @param {boolean} [opts.caseSensitive=false] - Si es sensible a mayúsculas/minúsculas
 * @param {boolean} [opts.gapOpenIncludesExtend=true] - Si la apertura incluye la primera base (BLAST) o no (Biopython)
 * @param {Object|Function} [opts.scoreMatrix] - Matriz o función personalizada (ca, cb) => number
 * @returns {Object} Resultado del alineamiento con secuencias alineadas, coordenadas, estadísticas y CIGAR
 */
export function smithWaterman(seqA, seqB, opts = {}) {
  if (typeof seqA !== 'string' || typeof seqB !== 'string') {
    throw new TypeError('Las secuencias de entrada deben ser cadenas de texto');
  }

  const match = opts.match !== undefined ? Number(opts.match) : DEFAULT_ALIGN_OPTS.match;
  let mismatch = DEFAULT_ALIGN_OPTS.mismatch;
  if (opts.mismatch !== undefined) {
    mismatch = opts.mismatch <= 0 ? Number(opts.mismatch) : -Number(opts.mismatch);
  }
  const gapOpen = opts.gapOpen !== undefined ? Math.abs(Number(opts.gapOpen)) : DEFAULT_ALIGN_OPTS.gapOpen;
  const gapExtend = opts.gapExtend !== undefined ? Math.abs(Number(opts.gapExtend)) : DEFAULT_ALIGN_OPTS.gapExtend;
  const caseSensitive = opts.caseSensitive !== undefined ? Boolean(opts.caseSensitive) : DEFAULT_ALIGN_OPTS.caseSensitive;
  const gapOpenIncludesExtend = opts.gapOpenIncludesExtend !== undefined
    ? Boolean(opts.gapOpenIncludesExtend)
    : DEFAULT_ALIGN_OPTS.gapOpenIncludesExtend;

  const rawA = seqA;
  const rawB = seqB;
  const a = caseSensitive ? rawA : rawA.toUpperCase();
  const b = caseSensitive ? rawB : rawB.toUpperCase();

  const n = a.length;
  const m = b.length;

  // Si alguna secuencia es vacía, el alineamiento local óptimo es nulo
  if (n === 0 || m === 0) {
    return {
      score: 0,
      alignedA: '',
      alignedB: '',
      startA: 0,
      endA: 0,
      startB: 0,
      endB: 0,
      length: 0,
      matches: 0,
      mismatches: 0,
      gaps: 0,
      gapOpens: 0,
      gapExtensions: 0,
      identity: 0,
      similarity: 0,
      cigar: '',
      cigarOps: [],
    };
  }

  let scoreFn;
  if (typeof opts.scoreMatrix === 'function') {
    scoreFn = opts.scoreMatrix;
  } else if (opts.scoreMatrix && typeof opts.scoreMatrix === 'object') {
    const sm = opts.scoreMatrix;
    scoreFn = (ca, cb) => {
      if (sm[ca] && sm[ca][cb] !== undefined) return sm[ca][cb];
      if (sm[cb] && sm[cb][ca] !== undefined) return sm[cb][ca];
      return ca === cb ? match : mismatch;
    };
  } else {
    scoreFn = (ca, cb) => (ca === cb ? match : mismatch);
  }

  const openPenalty = gapOpenIncludesExtend ? (gapOpen + gapExtend) : gapOpen;

  const w = m + 1;
  const totalCells = (n + 1) * w;
  const H = new Float64Array(totalCells);
  const E = new Float64Array(totalCells);
  const F = new Float64Array(totalCells);
  const trace = new Uint8Array(totalCells);

  // Inicialización de límites (en alineación local el alineamiento no arranca con huecos)
  for (let i = 0; i <= n; i++) {
    const idx = i * w;
    E[idx] = NEG_INF;
    F[idx] = NEG_INF;
    H[idx] = 0;
  }
  for (let j = 0; j <= m; j++) {
    E[j] = NEG_INF;
    F[j] = NEG_INF;
    H[j] = 0;
  }

  let maxScore = 0;
  let maxI = 0;
  let maxJ = 0;

  // Llenado de matrices de programación dinámica
  for (let i = 1; i <= n; i++) {
    const charA = a[i - 1];
    const rowOffset = i * w;
    const prevRowOffset = (i - 1) * w;

    for (let j = 1; j <= m; j++) {
      const idx = rowOffset + j;
      const prevRowIdx = prevRowOffset + j;
      const prevColIdx = rowOffset + (j - 1);
      const diagIdx = prevRowOffset + (j - 1);

      // E[i, j]: hueco en B (extensión vertical / deleción en referencia B)
      const hPrevI = H[prevRowIdx];
      const ePrev = E[prevRowIdx];
      const canOpenE = hPrevI > 0 ? hPrevI - openPenalty : NEG_INF;
      const canExtendE = ePrev > NEG_INF / 2 ? ePrev - gapExtend : NEG_INF;

      let eVal = NEG_INF;
      let eSource = 0; // 0 = open desde H, 1 = extend desde E
      if (canExtendE >= canOpenE && canExtendE > NEG_INF / 2) {
        eVal = canExtendE;
        eSource = 1;
      } else if (canOpenE > NEG_INF / 2) {
        eVal = canOpenE;
        eSource = 0;
      }
      E[idx] = eVal;

      // F[i, j]: hueco en A (extensión horizontal / inserción en referencia B)
      const hPrevJ = H[prevColIdx];
      const fPrev = F[prevColIdx];
      const canOpenF = hPrevJ > 0 ? hPrevJ - openPenalty : NEG_INF;
      const canExtendF = fPrev > NEG_INF / 2 ? fPrev - gapExtend : NEG_INF;

      let fVal = NEG_INF;
      let fSource = 0; // 0 = open desde H, 1 = extend desde F
      if (canExtendF >= canOpenF && canExtendF > NEG_INF / 2) {
        fVal = canExtendF;
        fSource = 1;
      } else if (canOpenF > NEG_INF / 2) {
        fVal = canOpenF;
        fSource = 0;
      }
      F[idx] = fVal;

      // M[i, j]: sustitución / coincidencia en la diagonal
      const matchScore = scoreFn(charA, b[j - 1]);
      const mVal = H[diagIdx] + matchScore;

      // H[i, j]: máximo de 0, M, E, F
      // Preferencia ante empates: M (diagonal) > E (vertical) > F (horizontal) > 0 (stop)
      let best = 0;
      let hSource = 0; // 0 = stop
      if (mVal > best) {
        best = mVal;
        hSource = 1; // M
      }
      if (eVal > best) {
        best = eVal;
        hSource = 2; // E
      }
      if (fVal > best) {
        best = fVal;
        hSource = 3; // F
      }

      H[idx] = best;
      trace[idx] = hSource | (eSource << 2) | (fSource << 3);

      if (best > maxScore) {
        maxScore = best;
        maxI = i;
        maxJ = j;
      }
    }
  }

  // Si la puntuación máxima es <= 0, no existe ningún alineamiento local con ganancia positiva
  if (maxScore <= 0) {
    return {
      score: 0,
      alignedA: '',
      alignedB: '',
      startA: 0,
      endA: 0,
      startB: 0,
      endB: 0,
      length: 0,
      matches: 0,
      mismatches: 0,
      gaps: 0,
      gapOpens: 0,
      gapExtensions: 0,
      identity: 0,
      similarity: 0,
      cigar: '',
      cigarOps: [],
    };
  }

  // Reconstrucción del alineamiento (Backtracking)
  const alignedAChars = [];
  const alignedBChars = [];
  let currI = maxI;
  let currJ = maxJ;
  let currState = trace[currI * w + currJ] & 3;

  while (currI > 0 && currJ > 0 && currState !== 0) {
    const idx = currI * w + currJ;
    if (currState === 1) { // M: match o mismatch
      alignedAChars.push(rawA[currI - 1]);
      alignedBChars.push(rawB[currJ - 1]);
      currI--;
      currJ--;
      currState = trace[currI * w + currJ] & 3;
    } else if (currState === 2) { // E: hueco en B (base en A, '-' en B)
      alignedAChars.push(rawA[currI - 1]);
      alignedBChars.push('-');
      const isExtend = (trace[idx] >> 2) & 1;
      currI--;
      if (isExtend) {
        currState = 2;
      } else {
        currState = trace[currI * w + currJ] & 3;
      }
    } else if (currState === 3) { // F: hueco en A ('-' en A, base en B)
      alignedAChars.push('-');
      alignedBChars.push(rawB[currJ - 1]);
      const isExtend = (trace[idx] >> 3) & 1;
      currJ--;
      if (isExtend) {
        currState = 3;
      } else {
        currState = trace[currI * w + currJ] & 3;
      }
    }
  }

  alignedAChars.reverse();
  alignedBChars.reverse();
  const alignedA = alignedAChars.join('');
  const alignedB = alignedBChars.join('');

  // Estadísticas del alineamiento y cálculo de la cadena CIGAR
  let matches = 0;
  let mismatches = 0;
  let gaps = 0;
  let gapOpens = 0;
  let gapExtensions = 0;
  let inGapA = false;
  let inGapB = false;

  const cigarOps = [];
  for (let k = 0; k < alignedA.length; k++) {
    const ca = alignedA[k];
    const cb = alignedB[k];

    let op;
    if (ca === '-') {
      gaps++;
      op = 'D'; // deleción en A (hueco en A)
      if (!inGapA) {
        gapOpens++;
        inGapA = true;
      } else {
        gapExtensions++;
      }
      inGapB = false;
    } else if (cb === '-') {
      gaps++;
      op = 'I'; // inserción en A (hueco en B)
      if (!inGapB) {
        gapOpens++;
        inGapB = true;
      } else {
        gapExtensions++;
      }
      inGapA = false;
    } else {
      inGapA = false;
      inGapB = false;
      op = 'M';
      const eq = caseSensitive ? ca === cb : ca.toUpperCase() === cb.toUpperCase();
      if (eq) matches++; else mismatches++;
    }

    if (cigarOps.length > 0 && cigarOps[cigarOps.length - 1].op === op) {
      cigarOps[cigarOps.length - 1].length++;
    } else {
      cigarOps.push({ op, length: 1 });
    }
  }

  const cigar = cigarOps.map((o) => o.length + o.op).join('');
  const length = alignedA.length;
  const identity = length > 0 ? matches / length : 0;
  const totalSubst = matches + mismatches;
  const similarity = totalSubst > 0 ? matches / totalSubst : 0;

  return {
    score: maxScore,
    alignedA,
    alignedB,
    startA: currI,
    endA: maxI,
    startB: currJ,
    endB: maxJ,
    length,
    matches,
    mismatches,
    gaps,
    gapOpens,
    gapExtensions,
    identity,
    similarity,
    cigar,
    cigarOps,
  };
}

/**
 * Alias conveniente para smithWaterman.
 */
export const align = smithWaterman;

/**
 * Formatea el resultado del alineamiento en una representación ASCII estándar de 3 líneas
 * (Query, línea de coincidencia '|', y Target) con coordenadas numéricas.
 *
 * @param {Object} result - Objeto retornado por smithWaterman
 * @param {Object} [opts] - Opciones de formato
 * @param {number} [opts.lineLength=60] - Número de caracteres por bloque
 * @returns {string} Texto formateado
 */
export function formatAlignment(result, opts = {}) {
  const { lineLength = 60 } = opts;
  const { alignedA, alignedB, startA, startB, score, identity, length } = result || {};
  if (!alignedA || !alignedB) return '(empty alignment)';

  const lines = [];
  lines.push(`Score: ${score} | Length: ${length} | Identity: ${(identity * 100).toFixed(1)}%`);

  let curA = startA;
  let curB = startB;

  for (let offset = 0; offset < alignedA.length; offset += lineLength) {
    const chunkA = alignedA.slice(offset, offset + lineLength);
    const chunkB = alignedB.slice(offset, offset + lineLength);

    let matchLine = '';
    let basesA = 0;
    let basesB = 0;

    for (let k = 0; k < chunkA.length; k++) {
      const ca = chunkA[k];
      const cb = chunkB[k];
      if (ca !== '-') basesA++;
      if (cb !== '-') basesB++;

      if (ca === '-' || cb === '-') {
        matchLine += ' ';
      } else if (ca.toUpperCase() === cb.toUpperCase()) {
        matchLine += '|';
      } else {
        matchLine += '.';
      }
    }

    const endPosA = curA + basesA;
    const endPosB = curB + basesB;

    lines.push('');
    lines.push(`SeqA  ${String(curA).padStart(6)}  ${chunkA}  ${endPosA}`);
    lines.push(`              ${matchLine}`);
    lines.push(`SeqB  ${String(curB).padStart(6)}  ${chunkB}  ${endPosB}`);

    curA = endPosA;
    curB = endPosB;
  }

  return lines.join('\n');
}

let _workerSeq = 0;

/**
 * Ejecuta el alineamiento Smith-Waterman en el Web Worker dedicado (js/workers/alignWorker.js),
 * manteniendo la interfaz de usuario completamente fluida. Si Web Worker no está disponible
 * (por ejemplo en entornos Node o sin soporte), se ejecuta de forma síncrona en el hilo actual.
 *
 * @param {string} seqA
 * @param {string} seqB
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export function alignWithWorker(seqA, seqB, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      try {
        resolve(smithWaterman(seqA, seqB, options));
      } catch (err) {
        reject(err);
      }
      return;
    }

    let worker;
    try {
      worker = new Worker(new URL('../workers/alignWorker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      // Si falla instanciar el worker, cae al cálculo síncrono
      try {
        resolve(smithWaterman(seqA, seqB, options));
      } catch (err) {
        reject(err);
      }
      return;
    }

    const id = ++_workerSeq;
    const cleanup = () => {
      try { worker.terminate(); } catch { /* noop */ }
    };

    worker.onmessage = (ev) => {
      const data = ev.data || {};
      if (data.id !== id) return;
      cleanup();
      if (data.ok) {
        resolve(data.result);
      } else {
        reject(new Error(data.error || 'Error en alignWorker'));
      }
    };

    worker.onerror = (ev) => {
      cleanup();
      reject(new Error((ev && ev.message) || 'Error en Web Worker de alineamiento'));
    };

    try {
      worker.postMessage({ id, type: 'align', payload: { seqA, seqB, options } });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
