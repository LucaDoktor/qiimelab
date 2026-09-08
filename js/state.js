// Estado compartido de la app: un pequeño almacén con "huecos" (slots), uno
// por tipo de dato de QIIME2 que los módulos consumen. Los módulos leen de
// aquí y se suscriben a los cambios; el módulo de carga es el único que
// escribe.

export const SLOT_LABELS = {
  metadata: 'Metadatos de las muestras',
  taxonomy: 'Taxonomía',
  taxaBarplot: 'Tabla de abundancia por taxón (taxa barplot)',
  taxaCounts: 'Tabla de conteos taxón × muestra',
  alphaDiversity: 'Diversidad alfa',
  betaDiversity: 'Matriz de distancias (diversidad beta)',
  differentialAbundance: 'Abundancia diferencial',
  functionalKO: 'Abundancia de KOs por muestra (PICRUSt2)',
  functionalCategories: 'Lista de KOs por módulo funcional',
  ordination: 'Ordenación PCoA (ordination.txt)',
  sequenceQC: 'Archivos FASTQ para control de calidad',
};

export const state = {
  files: [], // { id, name, size, note }
  metadata: null, // { sourceFileId, headers, rows, sampleIdKey }
  taxonomy: null, // { sourceFileId, headers, rows }
  taxaBarplot: null, // { sourceFileId, levels: { [n]: { headers, rows } } }
  alphaDiversity: null, // { metrics: { [name]: { sourceFileId, values: {sampleId: number} } } }
  betaDiversity: null, // { metrics: { [name]: { sourceFileId, sampleIds: [], matrix: number[][] } } }
  differentialAbundance: null, // { sourceFileId, headers, rows, mapping: {taxon, lfc, padj}, entityType: 'taxon'|'ko' }
  taxaCounts: null, // { sourceFileId, headers, rows, taxonKey } — conteos/abundancia crudos taxón × muestra (para Venn, PERMANOVA…)
  functionalKO: null, // { sourceFileId, headers, rows, koKey } — abundancia KO × muestra (PICRUSt2 unstrat)
  functionalCategories: null, // { sourceFileId, headers, rows, mapping: {module, ko} } — KOlist categorizada
  ordination: null, // { sourceFileId, metricName, sampleIds, coords: number[][], proportionExplained: number[], eigvals: number[] }
  sequenceQC: [], // [{ sourceFileId, name, report }] — informes de calidad FASTQ (varios archivos)
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  listeners.forEach((fn) => fn(state));
}

let nextFileId = 1;

export function registerFile(name, size, note) {
  const id = 'f' + nextFileId++;
  state.files.push({ id, name, size, note: note || '' });
  notify();
  return id;
}

export function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id);
  const clearIfMatches = (slot) => {
    if (state[slot] && state[slot].sourceFileId === id) state[slot] = null;
  };
  ['metadata', 'taxonomy', 'taxaBarplot', 'taxaCounts', 'differentialAbundance', 'functionalKO', 'functionalCategories', 'ordination'].forEach(clearIfMatches);
  if (Array.isArray(state.sequenceQC)) {
    state.sequenceQC = state.sequenceQC.filter((q) => q.sourceFileId !== id);
  }
  if (state.alphaDiversity) {
    for (const key of Object.keys(state.alphaDiversity.metrics)) {
      if (state.alphaDiversity.metrics[key].sourceFileId === id) delete state.alphaDiversity.metrics[key];
    }
    if (Object.keys(state.alphaDiversity.metrics).length === 0) state.alphaDiversity = null;
  }
  if (state.betaDiversity) {
    for (const key of Object.keys(state.betaDiversity.metrics)) {
      if (state.betaDiversity.metrics[key].sourceFileId === id) delete state.betaDiversity.metrics[key];
    }
    if (Object.keys(state.betaDiversity.metrics).length === 0) state.betaDiversity = null;
  }
  notify();
}

export function setSlot(slot, value) {
  state[slot] = value;
  notify();
}

export function addAlphaMetric(name, sourceFileId, values) {
  if (!state.alphaDiversity) state.alphaDiversity = { metrics: {} };
  state.alphaDiversity.metrics[name] = { sourceFileId, values };
  notify();
}

export function addBetaMetric(name, sourceFileId, sampleIds, matrix) {
  if (!state.betaDiversity) state.betaDiversity = { metrics: {} };
  state.betaDiversity.metrics[name] = { sourceFileId, sampleIds, matrix };
  notify();
}

export function addTaxaBarplotLevel(sourceFileId, level, headers, rows) {
  if (!state.taxaBarplot) state.taxaBarplot = { sourceFileId, levels: {} };
  state.taxaBarplot.levels[level] = { headers, rows };
  notify();
}

export function addSequenceQC(entry) {
  if (!Array.isArray(state.sequenceQC)) state.sequenceQC = [];
  // reemplaza si ya hay un informe para el mismo nombre de archivo
  state.sequenceQC = state.sequenceQC.filter((q) => q.name !== entry.name);
  state.sequenceQC.push(entry);
  notify();
}
