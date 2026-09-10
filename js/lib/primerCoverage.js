// Cobertura de un primer (o pareja) contra una referencia APORTADA POR EL
// USUARIO: % de secuencias donde encaja, lista de las que no, y si hay
// taxonomía, cobertura agrupada por grupo taxonómico. Búsqueda directa
// (js/lib/primerTemplate.js) con tolerancia a mismatches configurable —
// nada de BLAST ni de bases de datos externas. Esto NO es una búsqueda
// contra GenBank/SILVA/Greengenes completos: es solo contra lo que el
// usuario ha subido (su propio panel, o un recorte de una base de datos).

import { findPrimerSites, findAmplicons } from './primerTemplate.js';
import { normalizeHeader } from './csv.js';

/** Cobertura de UN primer o de UNA PAREJA ({forward, reverse}) contra una
 *  lista de referencias [{id, seq}]. */
export function computeCoverage(refs, primer, opts = {}) {
  const maxMismatches = opts.maxMismatches ?? 0;
  const isPair = primer && typeof primer === 'object' && 'forward' in primer && 'reverse' in primer;
  const perRef = refs.map((ref) => {
    let covered, detail;
    if (isPair) {
      const { amplicons } = findAmplicons(ref.seq, primer.forward, primer.reverse, { maxMismatches });
      covered = amplicons.length > 0;
      detail = amplicons[0] || null;
    } else {
      const hits = findPrimerSites(ref.seq, primer, { maxMismatches });
      covered = hits.length > 0;
      detail = hits[0] || null;
    }
    return { id: ref.id, covered, detail };
  });
  const coveredCount = perRef.filter((r) => r.covered).length;
  return {
    total: refs.length,
    covered: coveredCount,
    pct: refs.length ? (coveredCount / refs.length) * 100 : 0,
    perRef,
    uncovered: perRef.filter((r) => !r.covered).map((r) => r.id),
  };
}

/** Recorta una cadena de taxonomía QIIME2 (`d__Bacteria;p__...;g__...`) a los
 *  primeros `depth` niveles (undefined/null/>=nº de niveles = completa). */
export function taxonAtRank(taxonString, depth) {
  const parts = String(taxonString || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (!depth || depth >= parts.length) return parts.join('; ');
  return parts.slice(0, depth).join('; ');
}

/** Agrupa el resultado de computeCoverage() por grupo taxonómico —
 *  taxonomyMap = { refId: 'cadena de taxonomía' }. Las referencias sin
 *  entrada en taxonomyMap caen en «(sin taxonomía)». */
export function groupCoverageByTaxon(coverage, taxonomyMap, depth) {
  const groups = new Map();
  coverage.perRef.forEach((r) => {
    const raw = taxonomyMap ? taxonomyMap[r.id] : null;
    const label = raw ? taxonAtRank(raw, depth) : '(sin taxonomía)';
    if (!groups.has(label)) groups.set(label, { label, total: 0, covered: 0, ids: [] });
    const g = groups.get(label);
    g.total++;
    if (r.covered) g.covered++;
    g.ids.push(r.id);
  });
  return [...groups.values()]
    .map((g) => ({ ...g, pct: g.total ? (g.covered / g.total) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

const ID_ALIASES = ['featureid', 'id', 'otuid', 'seqid', 'accession', 'name', 'asvid'];
const TAXON_ALIASES = ['taxon', 'taxonomy', 'lineage', 'classification'];

/** Adivina las columnas id/taxonomía de una tabla subida (mismos alias
 *  habituales que usa ingest.js para otras tablas) y devuelve el mapa
 *  {id: taxonomía} listo para groupCoverageByTaxon(). */
export function buildTaxonomyMap(headers, rows) {
  const byNorm = headers.map((h) => ({ h, n: normalizeHeader(h) }));
  const idCol = (byNorm.find((x) => ID_ALIASES.includes(x.n)) || byNorm[0] || {}).h;
  const taxCol = (byNorm.find((x) => TAXON_ALIASES.includes(x.n)) || byNorm[1] || {}).h;
  const map = {};
  if (idCol && taxCol) rows.forEach((r) => { if (r[idCol]) map[r[idCol]] = r[taxCol] || ''; });
  return { map, idCol, taxCol };
}
