// Alineamiento progresivo SIMPLIFICADO para el árbol filogenético (#/arbol).
//
// No es MAFFT ni MUSCLE: penalización de hueco LINEAL (sin huecos afines),
// sin ponderación de secuencias, puntuación "suma de pares" por columna.
// Pensado para secuencias cortas del mismo marcador y estudio (16S/ITS),
// no para conjuntos muy divergentes. La UI del módulo repite este aviso.
//
// Dos capas:
//   1. needlemanWunsch(a, b): alineamiento por pares clásico (dos secuencias
//      CRUDAS, letra a letra) — se usa para estimar las distancias que
//      construyen el árbol guía (ver phyloTree.js).
//   2. buildProgressiveAlignment(sequences, guideTree): alineamiento
//      progresivo — en cada nodo del árbol guía fusiona los DOS perfiles ya
//      alineados de sus hijos con un Needleman-Wunsch a nivel de COLUMNA
//      (puntuación = media de todas las combinaciones de caracteres entre
//      columnas, "suma de pares" normalizada — así una columna que ya es
//      todo huecos cuesta lo mismo que un hueco nuevo, y fusionar perfiles
//      grandes no cambia la escala de la puntuación).

const DEFAULT_OPTS = { match: 1, mismatch: -1, gap: -2 };

function opts(o) { return { ...DEFAULT_OPTS, ...o }; }

/**
 * Needleman-Wunsch clásico entre dos secuencias (strings, letra a letra).
 * Penalización de hueco lineal. Devuelve el alineamiento global óptimo.
 * @returns {{ alignedA:string, alignedB:string, score:number }}
 */
export function needlemanWunsch(a, b, o) {
  const { match, mismatch, gap } = opts(o);
  const n = a.length, m = b.length;
  const w = m + 1;
  const score = new Int32Array((n + 1) * w);
  const trace = new Uint8Array((n + 1) * w); // 0=diagonal, 1=arriba (gap en b), 2=izquierda (gap en a)
  for (let i = 1; i <= n; i++) { score[i * w] = i * gap; trace[i * w] = 1; }
  for (let j = 1; j <= m; j++) { score[j] = j * gap; trace[j] = 2; }
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
  let i = n, j = m, alignedA = '', alignedB = '';
  while (i > 0 || j > 0) {
    const dir = i === 0 ? 2 : j === 0 ? 1 : trace[i * w + j];
    if (dir === 0) { alignedA = a[i - 1] + alignedA; alignedB = b[j - 1] + alignedB; i--; j--; }
    else if (dir === 1) { alignedA = a[i - 1] + alignedA; alignedB = '-' + alignedB; i--; }
    else { alignedA = '-' + alignedA; alignedB = b[j - 1] + alignedB; j--; }
  }
  return { alignedA, alignedB, score: score[n * w + m] };
}

// ---------- alineamiento progresivo (perfil × perfil) ----------

const GAP_COLUMN_FREQ = new Map([['-', 1]]);

function freqOfColumn(col) {
  const f = new Map();
  for (const c of col) f.set(c, (f.get(c) || 0) + 1);
  return f;
}

function pairCharScore(a, b, o) {
  if (a === '-' && b === '-') return 0;
  if (a === '-' || b === '-') return o.gap;
  return a === b ? o.match : o.mismatch;
}

/** Puntuación media (suma de pares) entre dos columnas-perfil (frecuencias de carácter). */
function columnScore(freqA, freqB, o) {
  let total = 0, nA = 0, nB = 0;
  for (const nAi of freqA.values()) nA += nAi;
  for (const nBj of freqB.values()) nB += nBj;
  for (const [ca, na] of freqA) {
    for (const [cb, nb] of freqB) total += na * nb * pairCharScore(ca, cb, o);
  }
  return total / (nA * nB);
}

function leafProfile(memberIndex, seq) {
  const cols = [...seq].map((c) => [c]);
  return { members: [memberIndex], cols, freq: cols.map(freqOfColumn) };
}

/**
 * Fusiona dos perfiles ya alineados (cada uno con anchura fija) alineando
 * sus columnas con Needleman-Wunsch a nivel de columna. Devuelve un nuevo
 * perfil cuya anchura es >= max(anchura A, anchura B).
 */
function mergeProfiles(profA, profB, o) {
  const wA = profA.cols.length, wB = profB.cols.length;
  const w = wB + 1;
  const score = new Float64Array((wA + 1) * w);
  const trace = new Uint8Array((wA + 1) * w);
  for (let i = 1; i <= wA; i++) {
    score[i * w] = score[(i - 1) * w] + columnScore(profA.freq[i - 1], GAP_COLUMN_FREQ, o);
    trace[i * w] = 1;
  }
  for (let j = 1; j <= wB; j++) {
    score[j] = score[j - 1] + columnScore(GAP_COLUMN_FREQ, profB.freq[j - 1], o);
    trace[j] = 2;
  }
  for (let i = 1; i <= wA; i++) {
    const fA = profA.freq[i - 1];
    for (let j = 1; j <= wB; j++) {
      const fB = profB.freq[j - 1];
      const diag = score[(i - 1) * w + (j - 1)] + columnScore(fA, fB, o);
      const up = score[(i - 1) * w + j] + columnScore(fA, GAP_COLUMN_FREQ, o);
      const left = score[i * w + (j - 1)] + columnScore(GAP_COLUMN_FREQ, fB, o);
      let best = diag, dir = 0;
      if (up > best) { best = up; dir = 1; }
      if (left > best) { best = left; dir = 2; }
      score[i * w + j] = best;
      trace[i * w + j] = dir;
    }
  }
  const gapA = new Array(profA.members.length).fill('-');
  const gapB = new Array(profB.members.length).fill('-');
  let i = wA, j = wB;
  const mergedCols = [];
  while (i > 0 || j > 0) {
    const dir = i === 0 ? 2 : j === 0 ? 1 : trace[i * w + j];
    if (dir === 0) { mergedCols.unshift(profA.cols[i - 1].concat(profB.cols[j - 1])); i--; j--; }
    else if (dir === 1) { mergedCols.unshift(profA.cols[i - 1].concat(gapB)); i--; }
    else { mergedCols.unshift(gapA.concat(profB.cols[j - 1])); j--; }
  }
  return {
    members: profA.members.concat(profB.members),
    cols: mergedCols,
    freq: mergedCols.map(freqOfColumn),
  };
}

/**
 * Alineamiento progresivo siguiendo un árbol guía (nodo raíz con la MISMA
 * forma que devuelve stats.js `upgma()`: hojas = {label, left:null,
 * right:null}, internos = {left, right}). `label` de cada hoja debe ser el
 * ÍNDICE (como string) de la secuencia en `sequences`.
 * @param {string[]} sequences
 * @param {object} guideTreeNode
 * @returns {Map<number,string>} índice de secuencia original -> secuencia alineada
 */
export function buildProgressiveAlignment(sequences, guideTreeNode, o) {
  const options = opts(o);
  function recurse(node) {
    if (!node.left && !node.right) {
      const idx = parseInt(node.label, 10);
      return leafProfile(idx, sequences[idx]);
    }
    const l = recurse(node.left);
    const r = recurse(node.right);
    return mergeProfiles(l, r, options);
  }
  const root = sequences.length === 1 ? leafProfile(0, sequences[0]) : recurse(guideTreeNode);
  const width = root.cols.length;
  const out = new Map();
  root.members.forEach((seqIdx, k) => {
    let s = '';
    for (let c = 0; c < width; c++) s += root.cols[c][k];
    out.set(seqIdx, s);
  });
  return out;
}
