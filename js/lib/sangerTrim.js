// Recorte por calidad de una lectura Sanger.
//
// Por defecto: algoritmo de Mott modificado (el que usan phred/Lucy/
// sangeranalyseR), más sensible a caídas de calidad CORTAS y SEVERAS que una
// media de ventana deslizante. Con una media de ventana, una sola base
// pésima queda diluida entre vecinas buenas y el corte no la detecta; con
// Mott, esa base pésima aporta un término muy negativo que un tramo bueno
// corto no puede compensar. Diagnosticado sobre un caso real (cola de
// homopolímero con Phred 4-12 que la media de ventana dejaba pasar) — ver
// tests/sangertrim.mjs.
//
// La ventana deslizante se deja como alternativa seleccionable (para
// comparar o reproducir un pipeline que ya la use), no como método por
// defecto.

/**
 * Algoritmo de Mott: para cada base, d_i = umbral_error − 10^(−Q_i/10); el
 * tramo de recorte es el subarray CONTIGUO que maximiza la suma de d_i
 * (subarray máximo, Kadane, permitiendo el subarray vacío como mínimo = 0 —
 * si ninguna región supera el umbral en conjunto, se recorta todo).
 * @param {Uint8Array|number[]} quality Phred por base
 * @param {{ errorProbThreshold?: number }} [opts] probabilidad de error de
 *   referencia (por defecto 0.05, equivalente a Phred 13)
 * @returns {{ start: number, end: number }} rango [start, end) a conservar
 */
export function mottTrim(quality, opts = {}) {
  const { errorProbThreshold = 0.05 } = opts;
  const n = quality.length;
  if (n === 0) return { start: 0, end: 0 };
  let best = 0, bestStart = 0, bestEnd = 0;
  let cur = 0, curStart = 0;
  for (let i = 0; i < n; i++) {
    const d = errorProbThreshold - Math.pow(10, -quality[i] / 10);
    cur += d;
    if (cur < 0) { cur = 0; curStart = i + 1; continue; }
    if (cur > best) { best = cur; bestStart = curStart; bestEnd = i + 1; }
  }
  return { start: bestStart, end: bestEnd };
}

function windowMean(quality, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += quality[i];
  return s / (b - a);
}

/**
 * Ventana deslizante clásica: primer/último punto donde la media de una
 * ventana de `windowSize` bases alcanza `minQuality`. Si ninguna ventana la
 * alcanza, no recorta ese extremo (se queda en 0 / longitud total) — mismo
 * comportamiento que el pipeline de referencia que reproduce.
 * @param {Uint8Array|number[]} quality
 * @param {{ windowSize?: number, minQuality?: number }} [opts]
 * @returns {{ start: number, end: number }}
 */
export function windowTrim(quality, opts = {}) {
  const { windowSize = 15, minQuality = 20 } = opts;
  const n = quality.length;
  if (n < windowSize) return { start: 0, end: n };
  let start = 0;
  for (let i = 0; i <= n - windowSize; i++) {
    if (windowMean(quality, i, i + windowSize) >= minQuality) { start = i; break; }
  }
  let end = n;
  for (let i = n; i >= windowSize; i--) {
    if (windowMean(quality, i - windowSize, i) >= minQuality) { end = i; break; }
  }
  return { start, end };
}

/**
 * Recorta una lectura por calidad y aplica la longitud mínima post-recorte.
 * @param {Uint8Array|number[]} quality
 * @param {{ method?: 'mott'|'window', errorProbThreshold?: number,
 *   windowSize?: number, minQuality?: number, minLength?: number }} [opts]
 * @returns {{ start: number, end: number, length: number, discarded: boolean }}
 */
export function trimRead(quality, opts = {}) {
  const { method = 'mott', minLength = 50 } = opts;
  const { start, end } = method === 'window' ? windowTrim(quality, opts) : mottTrim(quality, opts);
  const length = Math.max(0, end - start);
  return { start, end, length, discarded: length < minLength };
}
