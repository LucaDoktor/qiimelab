// "Columnas detectadas": para cada dato cargado que tenga un mapeo
// columna→campo (qué columna del archivo del usuario hace de Sample ID, de
// log2FC, de padj…), devuelve ese mapeo de forma editable. Lo muestra #/cargar
// para que se vea ANTES de entrar al módulo y se pueda corregir ahí mismo.
//
// El "set" de cada campo escribe en el MISMO slot del estado que lee el
// módulo, así que el cambio es inmediato y coherente con su editor interno.

import { state, setSlot } from '../state.js';
import { t } from './i18n.js';

function fileName(id) {
  const f = (state.files || []).find((x) => x.id === id);
  return f ? f.name : null;
}

/**
 * @returns {Array<{
 *   slot:string, route:(string|null), fileName:(string|null),
 *   headers:(string[]|null), readOnly:boolean,
 *   fields:Array<{ key:string, label:string, current:string, options?:string[], set?:(h:string)=>void }>
 * }>}
 */
export function detectedMappings() {
  const out = [];

  // --- metadatos: columna de identificador de muestra ---
  if (state.metadata && Array.isArray(state.metadata.headers)) {
    const md = state.metadata;
    out.push({
      slot: 'metadata', route: null, fileName: fileName(md.sourceFileId),
      headers: md.headers, readOnly: false,
      fields: [{
        key: 'sampleId', label: t('colmap.sampleId'),
        current: md.sampleIdKey,
        options: md.headers,
        set: (h) => setSlot('metadata', { ...md, sampleIdKey: h }),
      }],
    });
  }

  // --- abundancia diferencial: taxón/KO · log2FC · p-ajustado ---
  if (state.differentialAbundance && state.differentialAbundance.mapping) {
    const da = state.differentialAbundance;
    const mk = (mapKey, labelKey) => ({
      key: mapKey, label: t(labelKey),
      current: da.headers[da.mapping[mapKey]] ?? '—',
      options: da.headers,
      set: (h) => {
        const i = da.headers.indexOf(h);
        if (i >= 0) setSlot('differentialAbundance', { ...da, mapping: { ...da.mapping, [mapKey]: i } });
      },
    });
    out.push({
      slot: 'differentialAbundance', route: 'diferencial', fileName: fileName(da.sourceFileId),
      headers: da.headers, readOnly: false,
      fields: [
        mk('taxon', da.entityType === 'ko' ? 'colmap.ko' : 'colmap.taxon'),
        mk('lfc', 'colmap.lfc'),
        mk('padj', 'colmap.padj'),
      ],
    });
  }

  // --- conteos taxón × muestra: columna de etiqueta del taxón ---
  if (state.taxaCounts && Array.isArray(state.taxaCounts.headers)) {
    const tc = state.taxaCounts;
    out.push({
      slot: 'taxaCounts', route: 'venn', fileName: fileName(tc.sourceFileId),
      headers: tc.headers, readOnly: false,
      fields: [{
        key: 'taxonKey', label: t('colmap.taxonLabel'),
        current: tc.taxonKey || tc.headers[0],
        options: tc.headers,
        set: (h) => setSlot('taxaCounts', { ...tc, taxonKey: h }),
      }],
    });
  }

  // --- lista KO por módulo funcional ---
  if (state.functionalCategories && state.functionalCategories.mapping) {
    const fc = state.functionalCategories;
    const mk = (mapKey, labelKey) => ({
      key: mapKey, label: t(labelKey),
      current: fc.headers[fc.mapping[mapKey]] ?? '—',
      options: fc.headers,
      set: (h) => {
        const i = fc.headers.indexOf(h);
        if (i >= 0) setSlot('functionalCategories', { ...fc, mapping: { ...fc.mapping, [mapKey]: i } });
      },
    });
    out.push({
      slot: 'functionalCategories', route: 'funcional', fileName: fileName(fc.sourceFileId),
      headers: fc.headers, readOnly: false,
      fields: [mk('module', 'colmap.module'), mk('ko', 'colmap.ko2')],
    });
  }

  // --- recuentos microbianos: varias series, cada una con su mapeo. Se
  //     muestra en lectura y se remite a su editor propio en #/recuentos. ---
  if (Array.isArray(state.microbialCounts) && state.microbialCounts.length) {
    state.microbialCounts.forEach((s) => {
      const gc = (s.mapping.groupCols || []).map((i) => s.headers[i]).filter(Boolean);
      out.push({
        slot: 'microbialCounts', route: 'recuentos', fileName: s.label,
        headers: null, readOnly: true,
        fields: [
          { key: 'groups', label: t('colmap.mcGroups'), current: gc.join(' · ') || '—' },
          { key: 'value', label: t('colmap.mcValue'), current: s.headers[s.mapping.valueCol] ?? '—' },
          ...(s.mapping.dilutionCol != null
            ? [{ key: 'dil', label: t('colmap.mcDil'), current: s.headers[s.mapping.dilutionCol] ?? '—' }]
            : []),
        ],
      });
    });
  }

  return out;
}
