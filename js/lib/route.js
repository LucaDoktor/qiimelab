// Coloca en el estado compartido un resultado ya clasificado por ingest.js.
// Lo usan tanto el módulo de carga (upload.js) como los cargadores de datos
// de ejemplo (exampleData.js), para que ambos caminos hagan exactamente lo
// mismo con cada tipo de archivo.

import { state, setSlot, addAlphaMetric, addBetaMetric, addTaxaBarplotLevel, addSequenceQC } from '../state.js';

export const KIND_LABELS = {
  metadata: 'Metadatos',
  taxonomy: 'Taxonomía',
  taxaBarplotLevel: 'Barplot taxonómico',
  taxaCounts: 'Conteos taxón × muestra',
  alphaDiversity: 'Diversidad alfa',
  betaDiversity: 'Diversidad beta',
  differentialAbundance: 'Abundancia diferencial',
  functionalKO: 'Abundancia funcional (KOs PICRUSt2)',
  functionalCategories: 'Módulos funcionales (lista de KOs)',
  ordination: 'Ordenación PCoA',
  sequenceQC: 'Control de calidad FASTQ',
};

let autoLevelSeq = 0;

/**
 * Aplica `result` (salida de classifyTable) al estado y devuelve una etiqueta
 * humana de qué se cargó.
 */
export function routeResultToState(fileId, result) {
  switch (result.kind) {
    case 'metadata':
      setSlot('metadata', { sourceFileId: fileId, headers: result.headers, rows: result.rows, sampleIdKey: result.sampleIdKey });
      return 'Metadatos (' + result.rows.length + ' muestras)';

    case 'taxonomy':
      setSlot('taxonomy', { sourceFileId: fileId, headers: result.headers, rows: result.rows });
      return 'Taxonomía (' + result.rows.length + ' features)';

    case 'taxaBarplotLevel': {
      const level = result.level != null ? result.level : ('auto-' + (++autoLevelSeq));
      addTaxaBarplotLevel(fileId, level, result.headers, result.rows);
      // Si la tabla ancha trae su propia columna de grupo y todavía no hay
      // metadatos, sintetizamos unos mínimos para poder agrupar el barplot sin
      // tener que subir el archivo de metadatos aparte.
      if (result.groupColumn && !state.metadata) {
        const idKey = result.headers[0];
        const seen = new Set();
        const rows = [];
        result.rows.forEach((r) => {
          const id = String(r[idKey] || '').trim();
          if (!id || seen.has(id)) return;
          seen.add(id);
          rows.push({ 'sample-id': id, [result.groupColumn]: r[result.groupColumn] });
        });
        setSlot('metadata', { sourceFileId: fileId, headers: ['sample-id', result.groupColumn], rows, sampleIdKey: 'sample-id', synthetic: true });
      }
      return 'Barplot taxonómico — nivel ' + level + ' (' + result.rows.length + ' muestras)';
    }

    case 'alphaDiversity':
      addAlphaMetric(result.metricName, fileId, result.values);
      return 'Diversidad alfa — ' + result.metricName + ' (' + Object.keys(result.values).length + ' muestras)';

    case 'betaDiversity':
      addBetaMetric(result.metricName, fileId, result.sampleIds, result.matrix);
      return 'Diversidad beta — ' + result.metricName + ' (' + result.sampleIds.length + ' muestras)';

    case 'differentialAbundance':
      setSlot('differentialAbundance', { sourceFileId: fileId, headers: result.headers, rows: result.rows, mapping: result.mapping });
      return 'Abundancia diferencial (' + result.rows.length + ' taxones)';

    case 'taxaCounts':
      setSlot('taxaCounts', { sourceFileId: fileId, headers: result.headers, rows: result.rows, taxonKey: result.taxonKey });
      return 'Conteos taxón × muestra (' + result.rows.length + ' taxones × ' + (result.headers.length - 1) + ' muestras)';

    case 'functionalKO':
      setSlot('functionalKO', { sourceFileId: fileId, headers: result.headers, rows: result.rows, koKey: result.koKey });
      return 'Abundancia funcional — ' + (result.rows.length) + ' KOs × ' + (result.headers.length - 1) + ' muestras';

    case 'functionalCategories':
      setSlot('functionalCategories', { sourceFileId: fileId, headers: result.headers, rows: result.rows, mapping: result.mapping });
      return 'Módulos funcionales — ' + result.rows.length + ' KOs categorizados';

    case 'sequenceQC':
      addSequenceQC({ sourceFileId: fileId, name: result.name, file: result.file, report: null });
      return 'FASTQ para control de calidad — ' + result.name;

    case 'ordination':
      setSlot('ordination', {
        sourceFileId: fileId, metricName: result.metricName, sampleIds: result.sampleIds,
        coords: result.coords, proportionExplained: result.proportionExplained, eigvals: result.eigvals,
      });
      return 'Ordenación PCoA — ' + result.metricName + ' (' + result.sampleIds.length + ' muestras)';

    default:
      return result.kind;
  }
}
