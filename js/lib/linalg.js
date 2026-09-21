// Álgebra lineal mínima, sin dependencias — soporte para RDA/CCA
// (js/lib/constrainedOrdination.js). Matrices representadas como array de
// arrays (fila × columna), como en el resto del proyecto (p. ej. distMatrix
// en stats.js). Pensado para las matrices pequeñas típicas aquí (decenas de
// muestras × variables), no para álgebra lineal a gran escala.

export function transpose(A) {
  const n = A.length, p = A[0]?.length || 0;
  const T = Array.from({ length: p }, () => new Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) T[j][i] = A[i][j];
  return T;
}

export function matMul(A, B) {
  const n = A.length, k = A[0]?.length || 0, p = B[0]?.length || 0;
  const C = Array.from({ length: n }, () => new Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let m = 0; m < k; m++) {
      const a = A[i][m];
      if (a === 0) continue;
      const rowB = B[m];
      for (let j = 0; j < p; j++) C[i][j] += a * rowB[j];
    }
  }
  return C;
}

/** Resta la media de cada columna (columnas centradas en 0). */
export function centerColumns(M) {
  const n = M.length, p = M[0]?.length || 0;
  const means = new Array(p).fill(0);
  for (const row of M) for (let j = 0; j < p; j++) means[j] += row[j] / n;
  return { centered: M.map((row) => row.map((v, j) => v - means[j])), means };
}

/** Resuelve A·X = B por eliminación gaussiana con pivoteo parcial.
 *  A: q×q. B: q×p (varias columnas a la vez, p. ej. X'Y completo). */
export function solveLinearSystem(A, B) {
  const n = A.length;
  const p = B[0]?.length || 0;
  // matriz aumentada [A | B], copia para no mutar los argumentos
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let col = 0; col < n; col++) {
    // pivoteo parcial: la fila con mayor valor absoluto en esta columna
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('Matriz singular o casi singular (variables explicativas colineales)');
    if (piv !== col) [M[col], M[piv]] = [M[piv], M[col]];
    const pivVal = M[col][col];
    for (let j = col; j < n + p; j++) M[col][j] /= pivVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = col; j < n + p; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

/** Autovalores/autovectores de una matriz SIMÉTRICA p×p por el método de
 *  Jacobi CÍCLICO: cada "barrido" rota TODOS los pares (p,q), p<q, en orden
 *  fijo (no solo el mayor término fuera de la diagonal, que converge
 *  demasiado despacio en matrices de más de un puñado de filas — p. ej. la
 *  matriz especies×especies de RDA/CCA puede tener decenas de filas). La
 *  convergencia es cuadrática tras los primeros barridos, así que unas pocas
 *  decenas de barridos bastan incluso para matrices de ~100×100.
 *  Devuelve { values, vectors } con values ordenados de mayor a menor y
 *  vectors[k] = autovector (array) asociado a values[k]. */
export function jacobiEigenSymmetric(A, { maxSweeps = 100, tol = 1e-12 } = {}) {
  const n = A.length;
  const a = A.map((row) => row.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  let frob = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) frob += a[i][j] * a[i][j];
  frob = Math.sqrt(frob) || 1; // tolerancia RELATIVA a la escala de la matriz, no absoluta

  const offNorm = () => {
    let s = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += a[i][j] * a[i][j];
    return Math.sqrt(s);
  };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (offNorm() < tol * frob) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = a[p][p], aqq = a[q][q];
        const phi = Math.abs(app - aqq) < 1e-300
          ? Math.PI / 4 * Math.sign(apq)
          : 0.5 * Math.atan2(2 * apq, app - aqq);
        const c = Math.cos(phi), s = Math.sin(phi);

        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp + s * akq;
          a[k][q] = -s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk + s * aqk;
          a[q][k] = -s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp + s * vkq;
          v[k][q] = -s * vkp + c * vkq;
        }
      }
    }
  }

  const values = a.map((row, i) => row[i]);
  const order = values.map((_, i) => i).sort((i, j) => values[j] - values[i]);
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => v.map((row) => row[i])),
  };
}
