// Chequeo de salud de los datos cargados AHORA MISMO en el estado.
//
// Hoy los desajustes se tragan en silencio ("if (g === undefined) return;" en
// varios módulos) y el usuario nunca se entera de que media tabla no cruza con
// los metadatos. checkDataHealth() los saca a la luz — no los arregla.
//
// El cruce muestra↔metadata usa matchSampleId() (js/lib/sampleMatch.js), EL
// MISMO criterio tolerante que ya usan alfa/beta/correlograma/funcional/Venn
// para resolver grupos: así lo que ve el chequeo es lo que ven los módulos.

import { state } from '../state.js';
import { t } from './i18n.js';
import { matchSampleId } from './sampleMatch.js';

/** IDs de muestra "declarados" por cada slot de datos presente. */
function sampleIdsBySlot() {
  const out = {};

  if (state.taxaBarplot) {
    const set = new Set();
    Object.values(state.taxaBarplot.levels).forEach((tbl) => {
      const key = tbl.headers[0];
      tbl.rows.forEach((r) => { const v = String(r[key] ?? '').trim(); if (v) set.add(v); });
    });
    out.taxaBarplot = [...set];
  }

  if (state.taxaCounts) {
    const key = state.taxaCounts.taxonKey || state.taxaCounts.headers[0];
    out.taxaCounts = state.taxaCounts.headers.filter((h) => h !== key);
  }

  if (state.alphaDiversity) {
    const set = new Set();
    Object.values(state.alphaDiversity.metrics).forEach((m) => Object.keys(m.values || {}).forEach((s) => set.add(s)));
    out.alphaDiversity = [...set];
  }

  if (state.betaDiversity) {
    const set = new Set();
    Object.values(state.betaDiversity.metrics).forEach((m) => (m.sampleIds || []).forEach((s) => set.add(s)));
    out.betaDiversity = [...set];
  }

  if (state.functionalKO) {
    const key = state.functionalKO.koKey || state.functionalKO.headers[0];
    out.functionalKO = state.functionalKO.headers.filter((h) => h !== key);
  }

  // sequenceQC se deja fuera a propósito: sus entradas se nombran por ARCHIVO
  // FASTQ (lecturas crudas), no por ID de muestra de metadatos, así que un
  // "desajuste" ahí es la norma y no una señal de salud de los datos.

  return out;
}

const SLOT_LABEL_KEY = {
  taxaBarplot: 'health.slotTaxaBarplot',
  taxaCounts: 'health.slotTaxaCounts',
  alphaDiversity: 'health.slotAlpha',
  betaDiversity: 'health.slotBeta',
  functionalKO: 'health.slotFunctional',
};

/**
 * Inspecciona el estado actual y devuelve una lista de hallazgos.
 * @returns {Array<{ level:'error'|'warning'|'info', code:string, message:string,
 *                    sampleIds:string[], column?:string, slot?:string }>}
 */
export function checkDataHealth() {
  const findings = [];
  const md = state.metadata;

  // --- 1. IDs de muestra duplicados dentro de metadata.rows ---
  if (md) {
    const count = new Map();
    md.rows.forEach((r) => {
      const id = String(r[md.sampleIdKey] ?? '').trim();
      if (id) count.set(id, (count.get(id) || 0) + 1);
    });
    const dups = [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    if (dups.length) {
      findings.push({
        level: 'error',
        code: 'metadata_duplicate_ids',
        message: dups.length === 1
          ? t('health.dupOne', { id: dups[0] })
          : t('health.dupMany', { n: dups.length }),
        sampleIds: dups,
      });
    }
  }

  // --- 2. columnas que pueden usarse para agrupar, con celdas vacías ---
  if (md) {
    md.headers.filter((h) => h !== md.sampleIdKey).forEach((col) => {
      const missing = md.rows
        .filter((r) => { const v = r[col]; return v == null || String(v).trim() === ''; })
        .map((r) => String(r[md.sampleIdKey] ?? '').trim())
        .filter(Boolean);
      if (missing.length) {
        findings.push({
          level: 'warning',
          code: 'group_column_empty',
          message: t('health.groupEmpty', { col, n: missing.length, total: md.rows.length }),
          sampleIds: missing,
          column: col,
        });
      }
    });
  }

  // --- 3. cruce archivo ↔ metadata ---
  const bySlot = sampleIdsBySlot();
  const mdIds = md
    ? md.rows.map((r) => String(r[md.sampleIdKey] ?? '').trim()).filter(Boolean)
    : [];
  const matchedMdIds = new Set(); // IDs de metadata referenciados por ALGÚN archivo

  if (md) {
    Object.entries(bySlot).forEach(([slot, ids]) => {
      const orphan = [];
      ids.forEach((sid) => {
        const k = matchSampleId(mdIds, sid);
        if (k == null) orphan.push(sid);
        else matchedMdIds.add(k);
      });
      if (orphan.length) {
        findings.push({
          level: 'warning',
          code: 'samples_not_in_metadata',
          message: t('health.notInMeta', { n: orphan.length, total: ids.length, what: t(SLOT_LABEL_KEY[slot]) }),
          sampleIds: orphan,
          slot,
        });
      }
    });

    // --- 4. muestras de metadata que ningún archivo cargado usa ---
    if (Object.keys(bySlot).length) {
      const unused = mdIds.filter((id) => !matchedMdIds.has(id));
      if (unused.length) {
        findings.push({
          level: 'info',
          code: 'metadata_samples_unused',
          message: t('health.unused', { n: unused.length, total: mdIds.length }),
          sampleIds: unused,
        });
      }
    }
  } else if (Object.keys(bySlot).length) {
    // hay datos pero no metadatos: no se puede cruzar nada
    findings.push({
      level: 'info',
      code: 'no_metadata',
      message: t('health.noMeta'),
      sampleIds: [],
    });
  }

  return findings;
}

/** ¿Hay ALGÚN dato de análisis cargado ahora mismo? */
function anyAnalysisData() {
  return !!(state.metadata || state.taxonomy || state.taxaBarplot || state.taxaCounts ||
    state.alphaDiversity || state.betaDiversity || state.differentialAbundance ||
    state.functionalKO || state.functionalCategories || state.ordination ||
    (Array.isArray(state.sequenceQC) && state.sequenceQC.length) ||
    (Array.isArray(state.diffComparisons) && state.diffComparisons.length) ||
    (Array.isArray(state.microbialCounts) && state.microbialCounts.length));
}

/**
 * Resume `checkDataHealth()` en un semáforo.
 * @returns {{ level:'empty'|'good'|'warning'|'error',
 *             findings:Array, errors:Array, warnings:Array, infos:Array,
 *             counts:{error:number,warning:number,info:number} }}
 */
export function summariseHealth() {
  const anyData = anyAnalysisData();
  const findings = anyData ? checkDataHealth() : [];
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  const infos = findings.filter((f) => f.level === 'info');
  let level = 'good';
  if (!anyData) level = 'empty';
  else if (errors.length) level = 'error';
  else if (warnings.length) level = 'warning';
  return {
    level, findings, errors, warnings, infos,
    counts: { error: errors.length, warning: warnings.length, info: infos.length },
  };
}
