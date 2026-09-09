// Guardar / restaurar la sesión completa como un único JSON.
//
// Qué se guarda:
//   · Cada slot de state.js (metadata, taxonomy, taxaBarplot, alphaDiversity,
//     betaDiversity, differentialAbundance, taxaCounts, functionalKO,
//     functionalCategories, ordination, sequenceQC) + state.files.
//     El objeto `report` de sequenceQC ya es JSON plano (arrays y números —
//     ver js/lib/fastq.js); solo se descarta el `File` crudo, que no es
//     serializable y solo hace falta para RE-analizar (no para mostrar).
//   · Todas las claves de localStorage con prefijo "qiimelab.chartStyle."
//     (enumeradas con Object.keys — no hay lista de módulos que mantener).
//   · qiimelab.profileName y qiimelab.lang (se leen tal cual; profile.js /
//     i18n.js siguen siendo los dueños de esas claves).

import {
  state, notify, clearAllState, setNextFileId, SLOT_KEYS,
} from '../state.js';
import { getLang, setLang } from './i18n.js';
import { getProfileName, setProfileName } from './profile.js';

export const SESSION_FORMAT = 1;
const CHART_STYLE_PREFIX = 'qiimelab.chartStyle.';
const PROFILE_KEY = 'qiimelab.profileName';
const LANG_KEY = 'qiimelab.lang';

const jclone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function sessionFilename() {
  return 'qiimelab-sesion-' + new Date().toISOString().slice(0, 10) + '.json';
}

/** Objeto JSON con toda la sesión. */
export function exportSession() {
  const out = {
    sessionFormat: SESSION_FORMAT,
    generatedAt: new Date().toISOString(),
    state: {},
  };

  out.state.files = (state.files || []).map((f) => ({ id: f.id, name: f.name, size: f.size, note: f.note || '' }));
  SLOT_KEYS.forEach((k) => { out.state[k] = jclone(state[k]); });

  // sequenceQC: report ya es plano; se quita el File
  out.state.sequenceQC = (Array.isArray(state.sequenceQC) ? state.sequenceQC : []).map((e) => ({
    sourceFileId: e.sourceFileId,
    name: e.name,
    report: jclone(e.report),
  }));

  // diffComparisons: tablas ya parseadas (headers/rows/mapping) — JSON plano
  out.state.diffComparisons = (Array.isArray(state.diffComparisons) ? state.diffComparisons : []).map((c) => jclone(c));

  // microbialCounts: series de recuento (headers/rows/mapping) — JSON plano
  out.state.microbialCounts = (Array.isArray(state.microbialCounts) ? state.microbialCounts : []).map((s) => jclone(s));

  // estilos de gráfico personalizados
  out.chartStyles = {};
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.indexOf(CHART_STYLE_PREFIX) === 0) {
        const raw = localStorage.getItem(k);
        try { out.chartStyles[k] = JSON.parse(raw); } catch (e) { out.chartStyles[k] = raw; }
      }
    });
  } catch (e) { /* localStorage puede lanzar en modo privado */ }

  try { out.profileName = localStorage.getItem(PROFILE_KEY); } catch (e) { out.profileName = null; }
  try { out.lang = localStorage.getItem(LANG_KEY); } catch (e) { out.lang = null; }

  return out;
}

/** Deep-clone + reasigna cualquier campo `sourceFileId` según `idMap`. */
function remapIds(node, idMap) {
  if (Array.isArray(node)) return node.map((x) => remapIds(x, idMap));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      const v = node[k];
      out[k] = (k === 'sourceFileId' && typeof v === 'string')
        ? (idMap[v] || v)
        : remapIds(v, idMap);
    }
    return out;
  }
  return node;
}

/** Resumen legible de lo que trae una sesión (para el modal de confirmación). */
export function describeSession(sess) {
  const s = (sess && sess.state) || {};
  const slots = SLOT_KEYS.filter((k) => s[k] != null).length
    + ((Array.isArray(s.sequenceQC) && s.sequenceQC.length) ? 1 : 0)
    + ((Array.isArray(s.diffComparisons) && s.diffComparisons.length) ? 1 : 0)
    + ((Array.isArray(s.microbialCounts) && s.microbialCounts.length) ? 1 : 0);
  return {
    files: Array.isArray(s.files) ? s.files.length : 0,
    slots,
    lang: sess && sess.lang,
    format: sess && sess.sessionFormat,
    formatMismatch: !!sess && sess.sessionFormat !== SESSION_FORMAT,
  };
}

/**
 * Restaura la sesión (DESTRUCTIVO — reemplaza la actual por completo).
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function importSession(sess) {
  const warnings = [];
  if (!sess || typeof sess !== 'object' || typeof sess.state !== 'object' || !sess.state) {
    return { ok: false, warnings: ['El archivo no parece una sesión de QiimeLab.'] };
  }
  if (sess.sessionFormat !== SESSION_FORMAT) {
    warnings.push('Formato de sesión ' + JSON.stringify(sess.sessionFormat) + ' (esta versión usa el ' + SESSION_FORMAT + '). Se restaura lo que case por nombre de slot.');
  }

  const src = sess.state;

  // 1. limpiar TODO (sin notify)
  clearAllState();

  // 2. archivos con ids secuenciales frescos + mapa old→new
  const idMap = {};
  const files = [];
  (Array.isArray(src.files) ? src.files : []).forEach((f, i) => {
    const newId = 'f' + (i + 1);
    if (f && f.id) idMap[f.id] = newId;
    files.push({ id: newId, name: (f && f.name) || ('archivo ' + (i + 1)), size: (f && f.size) || 0, note: (f && f.note) || '' });
  });
  state.files = files;
  setNextFileId(files.length + 1);

  // 3. cada slot: deep-clone + remap de sourceFileId (también los anidados en
  //    alphaDiversity.metrics / betaDiversity.metrics / sequenceQC)
  SLOT_KEYS.forEach((k) => {
    state[k] = (src[k] != null) ? remapIds(src[k], idMap) : null;
  });
  state.sequenceQC = (Array.isArray(src.sequenceQC) ? src.sequenceQC : []).map((e) => ({
    sourceFileId: (e && e.sourceFileId && idMap[e.sourceFileId]) || (e && e.sourceFileId) || null,
    name: e && e.name,
    file: null, // el FASTQ crudo no viaja en la sesión
    report: (e && e.report != null) ? jclone(e.report) : null,
  })).filter((e) => e.name);
  state.diffComparisons = (Array.isArray(src.diffComparisons) ? src.diffComparisons : [])
    .map((c) => remapIds(c, idMap))
    .filter((c) => c && Array.isArray(c.headers) && Array.isArray(c.rows));
  state.microbialCounts = (Array.isArray(src.microbialCounts) ? src.microbialCounts : [])
    .map((s) => remapIds(s, idMap))
    .filter((s) => s && Array.isArray(s.headers) && Array.isArray(s.rows) && s.mapping);

  // 4. estilos de gráfico: quita los actuales, mete los guardados
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.indexOf(CHART_STYLE_PREFIX) === 0) localStorage.removeItem(key);
    });
    const cs = sess.chartStyles || {};
    Object.keys(cs).forEach((key) => {
      if (key.indexOf(CHART_STYLE_PREFIX) !== 0) return;
      const val = cs[key];
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    });
  } catch (e) { warnings.push('No se han podido restaurar los estilos de gráfico (localStorage no disponible).'); }

  // 5. idioma / nombre local — vía su API pública (se autoguardan y avisan a
  //    sus suscriptores; son no-op si no cambia nada)
  try {
    if (typeof sess.lang === 'string' && sess.lang && sess.lang !== getLang()) setLang(sess.lang);
  } catch (e) { /* noop */ }
  try {
    const pn = (typeof sess.profileName === 'string') ? sess.profileName : '';
    if ((pn || '') !== (getProfileName() || '')) setProfileName(pn);
  } catch (e) { /* noop */ }

  // 6. un solo notify(): cada módulo montado ya hace subscribe(paint)
  notify();

  return { ok: true, warnings };
}
