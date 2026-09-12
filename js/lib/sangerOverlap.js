// Solapamiento forward/reverse + consenso para secuenciación Sanger.
//
// El pipeline de referencia que este módulo sustituye usaba una alineación
// local (Smith-Waterman) sin ancla sobre las lecturas COMPLETAS, aceptada
// solo con un %identidad global sobre el bloque que devolviera el
// alineador. Con genes muy conservados (16S) eso deja pasar bloques largos
// de baja identidad: motivos cortos conservados dispersos por toda la
// secuencia, encadenados por huecos, acumulan una puntuación total
// ligeramente positiva a lo largo de un tramo largo sin que exista ningún
// solapamiento biológico real. Aquí, en cambio:
//
//   1. Ancla por semillas (k-meros exactos, `findSeedAnchor`): busca la
//      DIAGONAL (desplazamiento) con más k-meros compatibles entre el
//      forward y el revcomp del reverse. Un solapamiento real acumula
//      decenas/cientos de k-meros en la MISMA diagonal; motivos cortos
//      dispersos no lo hacen (se reparten en muchas diagonales distintas
//      con 1 acierto cada una) — verificado en tests/sangeroverlap.mjs
//      contra casos reales donde el solapamiento no existe o es espurio.
//   2. Con la diagonal candidata, alineamiento acotado a una VENTANA
//      alrededor del ancla (extremo relevante de cada lectura + margen),
//      no las lecturas completas — `overlapAlign` es una variante de
//      Needleman-Wunsch con extremos libres (alineamiento "overlap": el
//      arranque es libre en cualquier punto del borde superior/izquierdo,
//      el final es libre en cualquier punto del borde inferior/derecho,
//      pero el camino intermedio NO puede reiniciar en cualquier celda —
//      a diferencia de Smith-Waterman, que sí, y es justo lo que permitía
//      el falso positivo).
//   3. Identidad en ventanas deslizantes cortas sobre el bloque alineado
//      (`windowedIdentityTrim`): si la identidad cae de forma sostenida,
//      recorta el límite del solapamiento hasta donde se sostiene, en vez
//      de aceptar el bloque completo.
//   4. Sin ancla fiable → no se fuerza un merge: se cae a "stitched"
//      (concatenar con N) marcado como pendiente de revisión manual.
//   5. Consenso ponderado por calidad en el solapamiento aceptado.

const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D' };

export function reverseComplement(seq) {
  let out = '';
  for (let i = seq.length - 1; i >= 0; i--) out += COMPLEMENT[seq[i]] || 'N';
  return out;
}

/**
 * Diagonal (desplazamiento i−j) con más k-meros exactos compatibles entre
 * `seqA` (p.ej. forward) y `seqB` (p.ej. revcomp del reverse), tolerando un
 * pequeño desplazamiento (`diagonalBand`) para absorber un indel puntual.
 * @returns {{ diagonal: number|null, score: number, reliable: boolean }}
 */
export function findSeedAnchor(seqA, seqB, opts = {}) {
  const { k = 15, diagonalBand = 2, minSeedHits = 3 } = opts;
  if (seqA.length < k || seqB.length < k) return { diagonal: null, score: 0, reliable: false };
  const index = new Map();
  for (let i = 0; i <= seqA.length - k; i++) {
    const km = seqA.substr(i, k);
    let arr = index.get(km);
    if (!arr) index.set(km, (arr = []));
    arr.push(i);
  }
  const hist = new Map();
  for (let j = 0; j <= seqB.length - k; j++) {
    const arr = index.get(seqB.substr(j, k));
    if (!arr) continue;
    for (const i of arr) hist.set(i - j, (hist.get(i - j) || 0) + 1);
  }
  let bestD = null, bestScore = 0;
  for (const d of hist.keys()) {
    let score = 0;
    for (let off = -diagonalBand; off <= diagonalBand; off++) score += hist.get(d + off) || 0;
    if (score > bestScore) { bestScore = score; bestD = d; }
  }
  return { diagonal: bestD, score: bestScore, reliable: bestD !== null && bestScore >= minSeedHits };
}

/**
 * Alineamiento "overlap" (extremos libres) por pares entre `a` y `b`:
 * arranque libre en la fila 0 / columna 0 (empezar en cualquier punto del
 * borde superior o izquierdo sin penalización), final libre en la última
 * fila / última columna (terminar en cualquier punto de esos bordes) — pero,
 * a diferencia de una alineación LOCAL, el camino intermedio no puede
 * reiniciar en ninguna celda interior: una vez que empieza, sigue por
 * diagonal/arriba/izquierda hasta terminar. Es el modelo correcto para
 * "sufijo de a solapa con prefijo de b" cuando ya se ha acotado la ventana
 * con un ancla — sin ese acotado, este mismo modelo sería tan permisivo
 * como Smith-Waterman.
 */
export function overlapAlign(a, b, opts = {}) {
  const { match = 1, mismatch = -1, gap = -2 } = opts;
  const n = a.length, m = b.length;
  const w = m + 1;
  const score = new Float64Array((n + 1) * w); // fila 0 / columna 0 ya quedan en 0 (arranque libre)
  const trace = new Uint8Array((n + 1) * w); // 0=diagonal, 1=arriba (gap en b), 2=izquierda (gap en a)
  for (let i = 1; i <= n; i++) {
    const ca = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const s = ca === b[j - 1] ? match : mismatch;
      const diag = score[(i - 1) * w + (j - 1)] + s;
      const up = score[(i - 1) * w + j] + gap;
      const left = score[i * w + (j - 1)] + gap;
      let best = diag, dir = 0;
      if (up > best) { best = up; dir = 1; }
      if (left > best) { best = left; dir = 2; }
      score[i * w + j] = best;
      trace[i * w + j] = dir;
    }
  }
  // final libre: el máximo en la ÚLTIMA fila o ÚLTIMA columna
  let bestI = n, bestJ = 0, bestScore = -Infinity;
  for (let j = 0; j <= m; j++) { const v = score[n * w + j]; if (v > bestScore) { bestScore = v; bestI = n; bestJ = j; } }
  for (let i = 0; i <= n; i++) { const v = score[i * w + m]; if (v > bestScore) { bestScore = v; bestI = i; bestJ = m; } }
  let i = bestI, j = bestJ, colsA = '', colsB = '';
  while (i > 0 && j > 0) {
    const dir = trace[i * w + j];
    if (dir === 0) { colsA = a[i - 1] + colsA; colsB = b[j - 1] + colsB; i--; j--; }
    else if (dir === 1) { colsA = a[i - 1] + colsA; colsB = '-' + colsB; i--; }
    else { colsA = '-' + colsA; colsB = b[j - 1] + colsB; j--; }
  }
  return { colsA, colsB, aStart: i, aEnd: bestI, bStart: j, bEnd: bestJ, score: bestScore };
}

function windowIdentity(colsA, colsB, a, b) {
  let m = 0;
  for (let i = a; i < b; i++) if (colsA[i] === colsB[i] && colsA[i] !== '-') m++;
  return m / (b - a);
}

/**
 * Recorta el bloque alineado (colsA/colsB, misma longitud, con '-' de hueco)
 * a la parte que arranca en la columna 0 y mantiene una identidad sostenida:
 * avanza ventana a ventana desde el principio y, si encuentra `maxBadRun`
 * ventanas consecutivas por debajo de `minIdentity`, corta en el final de la
 * última ventana buena — no en el final del bloque completo que devolvió el
 * alineador.
 * @returns {number} índice (0..colsA.length) hasta el que se acepta el bloque
 */
export function windowedIdentityTrim(colsA, colsB, opts = {}) {
  const { window = 25, minIdentity = 0.75, maxBadRun = 3 } = opts;
  const n = colsA.length;
  if (n === 0) return 0;
  if (n <= window) return windowIdentity(colsA, colsB, 0, n) >= minIdentity ? n : 0;
  let lastGoodEnd = 0, badRun = 0;
  for (let end = window; end <= n; end++) {
    if (windowIdentity(colsA, colsB, end - window, end) >= minIdentity) { lastGoodEnd = end; badRun = 0; }
    else if (++badRun >= maxBadRun) return lastGoodEnd;
  }
  return n;
}

const IUPAC_PAIR = { AG: 'R', GA: 'R', CT: 'Y', TC: 'Y', CG: 'S', GC: 'S', AT: 'W', TA: 'W', GT: 'K', TG: 'K', AC: 'M', CA: 'M' };

/**
 * Base consenso de una columna del solapamiento. Si coinciden, esa base. Si
 * una de las dos es hueco, la otra. Si discrepan y hay calidades: la de
 * mayor Phred si la diferencia es notable; si son parecidas (o no hay
 * calidad), código IUPAC de ambigüedad — y solo 'N' cuando además ambas
 * calidades son bajas (demasiado poco fiables para ni siquiera marcar la
 * ambigüedad con sentido).
 */
export function consensusBase(baseA, qA, baseB, qB, opts = {}) {
  const { qualityMargin = 10, lowQualityFloor = 15 } = opts;
  if (baseA === baseB) return baseA;
  if (baseA === '-') return baseB;
  if (baseB === '-') return baseA;
  if (qA == null || qB == null) return IUPAC_PAIR[baseA + baseB] || 'N';
  const diff = qA - qB;
  if (Math.abs(diff) >= qualityMargin) return diff > 0 ? baseA : baseB;
  if (qA < lowQualityFloor && qB < lowQualityFloor) return 'N';
  return IUPAC_PAIR[baseA + baseB] || 'N';
}

/**
 * Fusiona un forward y un reverse YA RECORTADOS por calidad (ver
 * sangerTrim.js) en una secuencia consenso, o cae a "stitched" si no hay
 * ancla fiable o el solapamiento no pasa las comprobaciones de
 * plausibilidad/identidad.
 * @param {{sequence:string, quality:(Uint8Array|number[]|null)}} forward
 * @param {{sequence:string, quality:(Uint8Array|number[]|null)}} reverse
 * @returns {{ method:'merged'|'stitched', needsReview:boolean, reason:string,
 *   consensus:string, overlapLen:number, matches:number, identity:number,
 *   nAmbiguous:number, anchorSeedHits:number, implausibleLength:boolean }}
 */
export function mergeReads(forward, reverse, opts = {}) {
  const {
    k = 15, diagonalBand = 2, minSeedHits = 3,
    match = 1, mismatch = -1, gap = -2,
    windowMargin = 40,
    idWindow = 25, minWindowIdentity = 0.75, maxBadRun = 3,
    minOverlapLen = 20, minIdentity = 0.90,
    expectedAmpliconLen = null, ampliconTolerance = 150,
    nsGap = 10, qualityMargin = 10, lowQualityFloor = 15,
  } = opts;

  const fSeq = forward.sequence, fQual = forward.quality;
  const rcSeq = reverseComplement(reverse.sequence);
  const rcQual = reverse.quality ? Array.from(reverse.quality).reverse() : null;

  const base = { overlapLen: 0, matches: 0, identity: 0, nAmbiguous: 0, anchorSeedHits: 0, implausibleLength: false };
  const stitch = (reason) => ({
    method: 'stitched', needsReview: true, reason,
    consensus: fSeq + 'N'.repeat(nsGap) + rcSeq, ...base,
  });

  const anchor = findSeedAnchor(fSeq, rcSeq, { k, diagonalBand, minSeedHits });
  base.anchorSeedHits = anchor.score;
  if (!anchor.reliable) return stitch('no_anchor');

  const dEstimate = Math.max(0, Math.min(fSeq.length, anchor.diagonal));
  const overlapEstimate = fSeq.length - dEstimate;
  const winFStart = Math.max(0, dEstimate - windowMargin);
  const winF = fSeq.slice(winFStart);
  const winR = rcSeq.slice(0, Math.min(rcSeq.length, overlapEstimate + windowMargin));
  if (winF.length === 0 || winR.length === 0) return stitch('no_anchor');

  const aln = overlapAlign(winF, winR, { match, mismatch, gap });
  if (aln.colsA.length === 0) return stitch('no_anchor');

  const trimEnd = windowedIdentityTrim(aln.colsA, aln.colsB, { window: idWindow, minIdentity: minWindowIdentity, maxBadRun });
  if (trimEnd === 0) return stitch('low_identity');

  const colsA = aln.colsA.slice(0, trimEnd);
  const colsB = aln.colsB.slice(0, trimEnd);

  let overlapLen = 0, matches = 0;
  for (let c = 0; c < colsA.length; c++) {
    if (colsA[c] !== '-' && colsB[c] !== '-') { overlapLen++; if (colsA[c] === colsB[c]) matches++; }
  }
  const identity = overlapLen > 0 ? matches / overlapLen : 0;
  Object.assign(base, { overlapLen, matches, identity });

  if (overlapLen < minOverlapLen) return stitch('overlap_too_short');
  if (identity < minIdentity) return stitch('low_identity');

  if (expectedAmpliconLen) {
    const predicted = fSeq.length + rcSeq.length - expectedAmpliconLen;
    if (Math.abs(overlapLen - predicted) > ampliconTolerance) base.implausibleLength = true;
  }

  const fOverlapStartAbs = winFStart + aln.aStart;
  let ai = aln.aStart, bi = aln.bStart, consensusOverlap = '', nAmbiguous = 0;
  for (let c = 0; c < colsA.length; c++) {
    const baseA = colsA[c], baseB = colsB[c];
    const qA = baseA === '-' ? null : (fQual ? fQual[winFStart + ai] : null);
    const qB = baseB === '-' ? null : (rcQual ? rcQual[bi] : null);
    const cb = consensusBase(baseA, qA, baseB, qB, { qualityMargin, lowQualityFloor });
    if (cb === 'N' || 'RYSWKM'.includes(cb)) nAmbiguous++;
    consensusOverlap += cb;
    if (baseA !== '-') ai++;
    if (baseB !== '-') bi++;
  }
  base.nAmbiguous = nAmbiguous;

  const consensus = fSeq.slice(0, fOverlapStartAbs) + consensusOverlap + rcSeq.slice(bi);
  return {
    method: 'merged', needsReview: base.implausibleLength, reason: base.implausibleLength ? 'implausible_length' : 'ok',
    consensus, ...base,
  };
}
