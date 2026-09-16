// Abundancia relativa por muestra a partir de lo que ya haya cargado el
// usuario (taxaBarplot o taxaCounts) — extraído de correlogram.js para que
// otros módulos (differentialAbundance.js) puedan cruzar un taxón contra su
// abundancia real sin duplicar esta lógica.

import { state } from '../state.js';

const OTHER_RE = /^(others?|otros?|resto)$/i;

/**
 * @returns {{ bySample: Object.<string, Map<string, number>>, ranked: string[] } | null}
 *   `bySample[taxonName]` es un Map muestra→abundancia relativa (%). `ranked`
 *   son los nombres de taxón ordenados de mayor a menor abundancia media.
 *   `null` si no hay ni taxaBarplot ni taxaCounts cargados.
 */
export function taxaRelativeAbundance() {
  // preferimos taxaBarplot (ya es por muestra); si no, taxaCounts (taxón × muestra)
  if (state.taxaBarplot) {
    const levels = Object.keys(state.taxaBarplot.levels).sort((a, b) => Number(a) - Number(b) || String(a).localeCompare(b));
    const table = state.taxaBarplot.levels[levels[levels.length - 1]];
    const sampleKey = table.headers[0];
    const taxonCols = table.headers.filter((h, i) => i !== 0 && !OTHER_RE.test(String(h).trim()));
    const otherCols = table.headers.filter((h, i) => i !== 0 && OTHER_RE.test(String(h).trim()));
    const bySample = {};
    taxonCols.forEach((tx) => { bySample[tx] = new Map(); });
    const meanAcc = {};
    taxonCols.forEach((tx) => { meanAcc[tx] = 0; });
    table.rows.forEach((r) => {
      const sid = String(r[sampleKey]).trim();
      const rowSum = taxonCols.concat(otherCols).reduce((a, h) => a + (parseFloat(r[h]) || 0), 0);
      if (rowSum <= 0) return;
      taxonCols.forEach((tx) => {
        const rel = (parseFloat(r[tx]) || 0) / rowSum * 100;
        bySample[tx].set(sid, rel);
        meanAcc[tx] += rel / table.rows.length;
      });
    });
    return { bySample, ranked: taxonCols.slice().sort((a, b) => meanAcc[b] - meanAcc[a]) };
  }

  if (state.taxaCounts) {
    const tc = state.taxaCounts;
    const taxonKey = tc.taxonKey || tc.headers[0];
    const sampleCols = tc.headers.filter((h) => h !== taxonKey);
    const totals = {};
    sampleCols.forEach((s) => { totals[s] = tc.rows.reduce((a, r) => a + (parseFloat(r[s]) || 0), 0); });
    const bySample = {}; const meanAcc = {};
    tc.rows.forEach((r) => {
      const taxon = String(r[taxonKey]).trim();
      bySample[taxon] = new Map(); meanAcc[taxon] = 0;
      sampleCols.forEach((s) => {
        if (!(totals[s] > 0)) return;
        const rel = (parseFloat(r[s]) || 0) / totals[s] * 100;
        bySample[taxon].set(s, rel);
        meanAcc[taxon] += rel / sampleCols.length;
      });
    });
    return { bySample, ranked: Object.keys(meanAcc).sort((a, b) => meanAcc[b] - meanAcc[a]) };
  }

  return null;
}
