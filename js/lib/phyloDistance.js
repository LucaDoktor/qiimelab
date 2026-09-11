// Matriz de distancias sobre un alineamiento múltiple, para el árbol
// filogenético (#/arbol). p-distance con eliminación por pares de las
// columnas con hueco (pairwise deletion) + corrección opcional de
// Jukes-Cantor (1969). Fórmulas verificadas frente a `ape::dist.dna()`
// (modelos "raw" y "JC69", pairwise.deletion=TRUE) — ver
// tests/stats/phylodistance.mjs.

/**
 * Proporción de sitios distintos entre dos secuencias YA ALINEADAS (misma
 * longitud). Las columnas donde cualquiera de las dos tiene un hueco se
 * excluyen (pairwise deletion, igual que `dist.dna(..., pairwise.deletion=TRUE)`).
 * @returns {number} NaN si no queda ninguna columna comparable
 */
export function pDistance(alignedA, alignedB) {
  if (alignedA.length !== alignedB.length) throw new Error('secuencias alineadas de distinta longitud');
  let diff = 0, compared = 0;
  for (let i = 0; i < alignedA.length; i++) {
    const a = alignedA[i], b = alignedB[i];
    if (a === '-' || b === '-') continue;
    compared++;
    if (a !== b) diff++;
  }
  return compared === 0 ? NaN : diff / compared;
}

/** Valor de reserva cuando Jukes-Cantor satura (p >= 0.75, ver más abajo). */
export const JC_SATURATION_CAP = 3;

/**
 * Corrección de Jukes-Cantor (1969): d = -3/4 · ln(1 - 4/3 p).
 * Indefinida (satura) cuando p >= 0.75 — devuelve NaN, igual que
 * `ape::dist.dna(model="JC69")`.
 */
export function jukesCantorCorrection(p) {
  if (!Number.isFinite(p)) return NaN;
  if (p >= 0.75) return NaN;
  return -0.75 * Math.log(1 - (4 / 3) * p);
}

/**
 * Matriz de distancias cuadrada sobre un conjunto de secuencias alineadas
 * (mismo orden que `alignedSeqs`).
 * @param {string[]} alignedSeqs
 * @param {{correction?: 'p'|'jc'}} options
 * @returns {{ matrix:number[][], saturated:[number,number][] }}
 *   `saturated` lista los pares donde JC69 no está definida (solo con
 *   correction:'jc'); esos pares quedan con el valor JC_SATURATION_CAP.
 */
export function buildDistanceMatrix(alignedSeqs, { correction = 'p' } = {}) {
  const n = alignedSeqs.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const saturated = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = pDistance(alignedSeqs[i], alignedSeqs[j]);
      let d = Number.isFinite(p) ? p : 0;
      if (correction === 'jc') {
        const jc = jukesCantorCorrection(p);
        if (Number.isFinite(jc)) d = jc;
        else { saturated.push([i, j]); d = JC_SATURATION_CAP; }
      }
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return { matrix, saturated };
}
